from __future__ import annotations

import io
from typing import Optional

import structlog
from fastapi import HTTPException, UploadFile, status

from app.api.v1.models.models import Listing, User, UserRole
from app.api.v1.repositories.listing_repository import (
    ListingImageRepository,
    ListingRepository,
)
from app.api.v1.schemas.schemas import (
    ListingCreateRequest,
    ListingResponse,
    ListingSearchParams,
    ListingUpdateRequest,
    PaginatedResponse,
)
from app.core.config import settings
from app.utils.storage import StorageClient
from app.workers.tasks import generate_thumbnail

logger = structlog.get_logger(__name__)

_MAX_IMAGES_PER_LISTING = 10


class ListingService:
    def __init__(
        self,
        listing_repo: ListingRepository,
        image_repo: ListingImageRepository,
        storage: StorageClient,
    ) -> None:
        self._listings = listing_repo
        self._images = image_repo
        self._storage = storage

    async def create_listing(
        self, data: ListingCreateRequest, owner: User
    ) -> ListingResponse:
        """
        Create a listing. Only Listers and Admins may create listings.
        """
        if owner.role not in (UserRole.LISTER, UserRole.ADMIN):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only Listers may create listings.",
            )

        amenities_str = (
            ",".join(data.amenities) if data.amenities else None
        )

        listing = await self._listings.create(
            owner_id=owner.id,
            title=data.title,
            description=data.description,
            property_type=data.property_type,
            address=data.address,
            city=data.city,
            state=data.state,
            country=data.country,
            latitude=data.latitude,
            longitude=data.longitude,
            monthly_rent=data.monthly_rent,
            security_deposit=data.security_deposit,
            utilities_included=data.utilities_included,
            gender_preference=data.gender_preference,
            max_occupants=data.max_occupants,
            available_from=data.available_from,
            amenities=amenities_str,
        )

        logger.info("listing_created", listing_id=listing.id, owner_id=owner.id)
        full = await self._listings.get_by_id_with_relations(listing.id)
        return ListingResponse.model_validate(full)

    async def get_listing(self, listing_id: str) -> ListingResponse:
        listing = await self._listings.get_by_id_with_relations(listing_id)
        if not listing:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Listing not found.",
            )
        # Fire-and-forget view increment (non-critical)
        await self._listings.increment_views(listing_id)
        return ListingResponse.model_validate(listing)

    async def update_listing(
        self,
        listing_id: str,
        data: ListingUpdateRequest,
        requesting_user: User,
    ) -> ListingResponse:
        listing = await self._get_owned_or_raise(listing_id, requesting_user)

        updates: dict = {
            k: v for k, v in data.model_dump(exclude_unset=True).items() if v is not None
        }

        if "amenities" in updates and isinstance(updates["amenities"], list):
            updates["amenities"] = ",".join(updates["amenities"])

        await self._listings.update(listing, **updates)
        full = await self._listings.get_by_id_with_relations(listing_id)
        return ListingResponse.model_validate(full)

    async def delete_listing(
        self, listing_id: str, requesting_user: User
    ) -> None:
        listing = await self._get_owned_or_raise(listing_id, requesting_user)
        await self._listings.soft_delete(listing)
        logger.info("listing_deleted", listing_id=listing_id, user_id=requesting_user.id)

    async def search_listings(
        self, params: ListingSearchParams
    ) -> PaginatedResponse[ListingResponse]:
        items, total = await self._listings.search(params)
        pages = max(1, -(-total // params.page_size))  # ceiling division
        return PaginatedResponse(
            items=[ListingResponse.model_validate(l) for l in items],
            total=total,
            page=params.page,
            page_size=params.page_size,
            pages=pages,
        )

    async def get_my_listings(self, owner: User) -> list[ListingResponse]:
        listings = await self._listings.get_user_listings(owner.id)
        return [ListingResponse.model_validate(l) for l in listings]

    async def upload_image(
        self,
        listing_id: str,
        file: UploadFile,
        requesting_user: User,
    ) -> dict:
        listing = await self._get_owned_or_raise(listing_id, requesting_user)

        image_count = await self._images.count_for_listing(listing_id)
        if image_count >= _MAX_IMAGES_PER_LISTING:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Maximum of {_MAX_IMAGES_PER_LISTING} images per listing.",
            )

        # Validate file
        content_type = file.content_type or ""
        if content_type not in settings.ALLOWED_IMAGE_TYPES:
            raise HTTPException(
                status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
                detail=f"Unsupported image type. Allowed: {', '.join(settings.ALLOWED_IMAGE_TYPES)}",
            )

        contents = await file.read()
        if len(contents) > settings.max_upload_size_bytes:
            raise HTTPException(
                status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                detail=f"File exceeds maximum size of {settings.MAX_UPLOAD_SIZE_MB} MB.",
            )

        # Upload to object storage
        storage_key = f"listings/{listing_id}/images/{file.filename}"
        cdn_url = await self._storage.upload(
            key=storage_key,
            data=contents,
            content_type=content_type,
        )

        is_primary = image_count == 0

        image = await self._images.create(
            listing_id=listing_id,
            storage_key=storage_key,
            cdn_url=cdn_url,
            content_type=content_type,
            file_size=len(contents),
            original_filename=file.filename,
            sort_order=image_count,
            is_primary=is_primary,
        )

        # Enqueue thumbnail generation
        generate_thumbnail.delay(
            image_id=image.id,
            storage_key=storage_key,
            listing_id=listing_id,
        )

        return {
            "id": image.id,
            "cdn_url": cdn_url,
            "is_primary": is_primary,
        }

    async def delete_image(
        self, listing_id: str, image_id: str, requesting_user: User
    ) -> None:
        await self._get_owned_or_raise(listing_id, requesting_user)

        image = await self._images.get_by_listing_and_id(listing_id, image_id)
        if not image:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Image not found.",
            )

        await self._storage.delete(image.storage_key)
        if image.thumbnail_key:
            await self._storage.delete(image.thumbnail_key)

        await self._images.delete(image)

    #  Helpers 
    async def _get_owned_or_raise(
        self, listing_id: str, user: User
    ) -> Listing:
        """Return listing if owned by user (or user is admin). 404/403 otherwise."""
        if user.role == UserRole.ADMIN:
            listing = await self._listings.get_by_id_with_relations(listing_id)
        else:
            listing = await self._listings.get_owner_listing(listing_id, user.id)

        if not listing:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Listing not found or you do not have permission to modify it.",
            )
        return listing
