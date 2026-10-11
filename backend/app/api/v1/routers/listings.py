from fastapi import Response, APIRouter, File, Query, Request, UploadFile, status

from app.api.v1.dependencies import CurrentUser, ListingServiceDep
from app.api.v1.models.models import GenderPreference, PropertyType
from app.api.v1.schemas.schemas import (
    ListingCreateRequest,
    ListingResponse,
    ListingSearchParams,
    ListingUpdateRequest,
    MessageResponse,
    PaginatedResponse,
    PublicListingResponse,
)
from app.core.rate_limit import LISTING_LIMIT, limiter

router = APIRouter(prefix="/listings", tags=["Listings"])


@router.get("/public", response_model=PaginatedResponse[PublicListingResponse], summary="Public landing page listings")
async def public_listings(
    response: Response,
    listing_service: ListingServiceDep,
    city: str | None = Query(default=None, min_length=1, max_length=100),
    area: str | None = Query(default=None, min_length=1, max_length=100),
    property_type: PropertyType | None = Query(default=None),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=3, ge=1, le=30),
) -> PaginatedResponse[PublicListingResponse]:
    response.headers["Cache-Control"] = "no-store"
    return await listing_service.search_public_listings(ListingSearchParams(
        city=city, area=area, property_type=property_type,
        page=page, page_size=page_size, sort_by="created_at", sort_order="desc",
    ))


@router.post(
    "",
    response_model=ListingResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a listing",
    description="Only users with the **Lister** or **Admin** role may create listings.",
    responses={
        403: {"description": "Insufficient role"},
        422: {"description": "Validation error"},
    },
)
@limiter.limit(LISTING_LIMIT)
async def create_listing(
    request: Request,
    response: Response,
    body: ListingCreateRequest,
    current_user: CurrentUser,
    listing_service: ListingServiceDep,
) -> ListingResponse:
    return await listing_service.create_listing(body, current_user)


@router.get(
    "",
    response_model=PaginatedResponse[ListingResponse],
    summary="Search / list listings",
    description="Filter, sort, and paginate available listings.",
)
async def search_listings(
    listing_service: ListingServiceDep,
    _current_user: CurrentUser,
    city: str | None = Query(default=None),
    min_rent: int | None = Query(default=None, ge=0),
    max_rent: int | None = Query(default=None, ge=0),
    gender_preference: GenderPreference | None = Query(default=None),
    property_type: PropertyType | None = Query(default=None),
    available_from: str | None = Query(default=None),
    sort_by: str = Query(default="created_at", pattern=r"^(created_at|monthly_rent|view_count)$"),
    sort_order: str = Query(default="desc", pattern=r"^(asc|desc)$"),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
) -> PaginatedResponse[ListingResponse]:
    from datetime import datetime

    params = ListingSearchParams(
        city=city,
        min_rent=min_rent,
        max_rent=max_rent,
        gender_preference=gender_preference,
        property_type=property_type,
        available_from=datetime.fromisoformat(available_from) if available_from else None,
        sort_by=sort_by,
        sort_order=sort_order,
        page=page,
        page_size=page_size,
    )
    return await listing_service.search_listings(params)


@router.get(
    "/me",
    response_model=list[ListingResponse],
    summary="Get my listings",
)
async def get_my_listings(
    current_user: CurrentUser,
    listing_service: ListingServiceDep,
) -> list[ListingResponse]:
    return await listing_service.get_my_listings(current_user)


@router.get(
    "/{listing_id}",
    response_model=ListingResponse,
    summary="Get listing by ID",
    responses={404: {"description": "Listing not found"}},
)
async def get_listing(
    listing_id: str,
    listing_service: ListingServiceDep,
    _current_user: CurrentUser,
) -> ListingResponse:
    return await listing_service.get_listing(listing_id)


@router.patch(
    "/{listing_id}",
    response_model=ListingResponse,
    summary="Update listing",
    responses={
        403: {"description": "Not the listing owner"},
        404: {"description": "Listing not found"},
    },
)
async def update_listing(
    listing_id: str,
    body: ListingUpdateRequest,
    current_user: CurrentUser,
    listing_service: ListingServiceDep,
) -> ListingResponse:
    return await listing_service.update_listing(listing_id, body, current_user)


@router.delete(
    "/{listing_id}",
    response_model=MessageResponse,
    summary="Delete listing (soft delete)",
    responses={
        403: {"description": "Not the listing owner"},
        404: {"description": "Listing not found"},
    },
)
async def delete_listing(
    listing_id: str,
    current_user: CurrentUser,
    listing_service: ListingServiceDep,
) -> MessageResponse:
    await listing_service.delete_listing(listing_id, current_user)
    return MessageResponse(message="Listing deleted.")


@router.post(
    "/{listing_id}/images",
    response_model=None,
    status_code=status.HTTP_201_CREATED,
    summary="Upload listing image",
    description=(
        "Upload an image for a listing. "
        "Maximum 10 images per listing. "
        "Thumbnail is generated asynchronously."
    ),
    responses={
        400: {"description": "Max images reached or invalid file"},
        413: {"description": "File too large"},
        415: {"description": "Unsupported media type"},
    },
)
@limiter.limit(LISTING_LIMIT)
async def upload_listing_image(
    request: Request,
    response: Response,
    listing_id: str,
    current_user: CurrentUser,
    listing_service: ListingServiceDep,
    file: UploadFile = File(...),
) -> dict:
    return await listing_service.upload_image(listing_id, file, current_user)


@router.delete(
    "/{listing_id}/images/{image_id}",
    response_model=MessageResponse,
    summary="Delete listing image",
)
async def delete_listing_image(
    listing_id: str,
    image_id: str,
    current_user: CurrentUser,
    listing_service: ListingServiceDep,
) -> MessageResponse:
    await listing_service.delete_image(listing_id, image_id, current_user)
    return MessageResponse(message="Image deleted.")
