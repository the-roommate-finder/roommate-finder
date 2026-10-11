from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import and_, asc, desc, func, or_, select, update
from sqlalchemy.orm import selectinload

from app.api.v1.models.models import GenderPreference, Listing, ListingImage, PropertyType, User
from app.api.v1.repositories.base import BaseRepository
from app.api.v1.schemas.schemas import ListingSearchParams


class ListingRepository(BaseRepository[Listing]):
    model = Listing

    async def get_by_id_with_relations(self, listing_id: str) -> Optional[Listing]:
        result = await self.db.execute(
            select(Listing)
            .options(
                selectinload(Listing.images),
                selectinload(Listing.owner),
            )
            .where(Listing.id == listing_id, Listing.is_deleted == False)  # noqa: E712
        )
        return result.scalar_one_or_none()

    async def get_owner_listing(
        self, listing_id: str, owner_id: str
    ) -> Optional[Listing]:
        result = await self.db.execute(
            select(Listing).where(
                Listing.id == listing_id,
                Listing.owner_id == owner_id,
                Listing.is_deleted == False,  # noqa: E712
            )
        )
        return result.scalar_one_or_none()

    async def search(
        self,
        params: ListingSearchParams,
        *, public_only: bool = False,
    ) -> tuple[list[Listing], int]:
        """
        Search listings with filters, sorting, and pagination.
        Returns (items, total_count).
        """
        filters = [
            Listing.is_deleted == False,  # noqa: E712
            Listing.is_available == True,  # noqa: E712
        ]

        if public_only:
            filters.append(Listing.owner.has(and_(User.is_active == True, User.is_deleted == False)))  # noqa: E712

        if params.city:
            filters.append(
                func.lower(Listing.city).contains(params.city.lower(), autoescape=True)
            )
        if params.area:
            filters.append(func.lower(Listing.address).contains(params.area.lower(), autoescape=True))
        if params.min_rent is not None:
            filters.append(Listing.monthly_rent >= params.min_rent)
        if params.max_rent is not None:
            filters.append(Listing.monthly_rent <= params.max_rent)
        if params.gender_preference:
            filters.append(
                or_(
                    Listing.gender_preference == GenderPreference.ANY,
                    Listing.gender_preference == params.gender_preference,
                )
            )
        if params.property_type:
            filters.append(Listing.property_type == params.property_type)
        if params.available_from:
            filters.append(
                or_(
                    Listing.available_from == None,  # noqa: E711
                    Listing.available_from <= params.available_from,
                )
            )

        # Count total
        count_stmt = select(func.count()).select_from(Listing).where(and_(*filters))
        total = (await self.db.execute(count_stmt)).scalar_one()

        # Sort
        sort_col = getattr(Listing, params.sort_by, Listing.created_at)
        order_fn = asc if params.sort_order == "asc" else desc

        # Paginate
        offset = (params.page - 1) * params.page_size
        stmt = (
            select(Listing)
            .options(
                selectinload(Listing.images),
                selectinload(Listing.owner),
            )
            .where(and_(*filters))
            .order_by(order_fn(sort_col), Listing.id.asc())
            .offset(offset)
            .limit(params.page_size)
        )
        result = await self.db.execute(stmt)
        items = list(result.scalars().all())
        return items, total

    async def soft_delete(self, listing: Listing) -> Listing:
        return await self.update(
            listing,
            is_deleted=True,
            deleted_at=datetime.now(timezone.utc),
        )

    async def increment_views(self, listing_id: str) -> None:
        await self.db.execute(
            update(Listing)
            .where(Listing.id == listing_id)
            .values(view_count=Listing.view_count + 1)
        )

    async def get_user_listings(
        self, owner_id: str, *, include_deleted: bool = False
    ) -> list[Listing]:
        filters = [Listing.owner_id == owner_id]
        if not include_deleted:
            filters.append(Listing.is_deleted == False)  # noqa: E712

        result = await self.db.execute(
            select(Listing)
            .options(
                selectinload(Listing.images),
                selectinload(Listing.owner),
            )
            .where(and_(*filters))
            .order_by(desc(Listing.created_at))
        )
        return list(result.scalars().all())


class ListingImageRepository(BaseRepository[ListingImage]):
    model = ListingImage

    async def get_listing_images(self, listing_id: str) -> list[ListingImage]:
        result = await self.db.execute(
            select(ListingImage)
            .where(ListingImage.listing_id == listing_id)
            .order_by(ListingImage.sort_order)
        )
        return list(result.scalars().all())

    async def get_by_listing_and_id(
        self, listing_id: str, image_id: str
    ) -> Optional[ListingImage]:
        result = await self.db.execute(
            select(ListingImage).where(
                ListingImage.id == image_id,
                ListingImage.listing_id == listing_id,
            )
        )
        return result.scalar_one_or_none()

    async def count_for_listing(self, listing_id: str) -> int:
        return await self.count(ListingImage.listing_id == listing_id)

    async def set_primary(self, listing_id: str, image_id: str) -> None:
        # Clear existing primary
        await self.db.execute(
            update(ListingImage)
            .where(ListingImage.listing_id == listing_id)
            .values(is_primary=False)
        )
        # Set new primary
        await self.db.execute(
            update(ListingImage)
            .where(ListingImage.id == image_id)
            .values(is_primary=True)
        )
