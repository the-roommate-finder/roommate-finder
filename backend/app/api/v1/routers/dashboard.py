"""Seeker discovery and account-scoped dashboard activity."""
from datetime import date, datetime, time, timezone
from typing import Literal
from uuid import UUID

from fastapi import APIRouter, HTTPException, Query, Response
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import Integer, any_, case, cast, delete, func, or_, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import selectinload

from app.api.v1.dependencies import CurrentUser, DbDep, require_role
from app.api.v1.models.models import DashboardBookmark, DashboardSearch, Listing, PropertyType, User, UserRole
from app.api.v1.schemas.schemas import PublicListingResponse, SeekerPreferences, UserSelfResponse

router = APIRouter(prefix="/dashboard", tags=["Seeker dashboard"], dependencies=[require_role(UserRole.SEEKER)])
Kind = Literal["room", "roommate"]


class SearchRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    city: str = Field(default="", max_length=100)
    area: str = Field(default="", max_length=100)
    kind: Kind = "roommate"


class RoommateResponse(BaseModel):
    id: str
    display_name: str | None
    age: int | None
    avatar_url: str | None
    bio: str | None
    preferences: SeekerPreferences
    updated_at: datetime


def roommate(user: User) -> RoommateResponse:
    today = datetime.now(timezone.utc).date()
    dob = user.date_of_birth.date() if user.date_of_birth else None
    age = today.year - dob.year - ((today.month, today.day) < (dob.month, dob.day)) if dob else None
    return RoommateResponse(id=user.id, display_name=user.display_name, age=age,
                            avatar_url=user.avatar_url, bio=user.bio,
                            preferences=SeekerPreferences.model_validate(user.seeker_preferences), updated_at=user.updated_at)


def visible_roommates(user_id: str):
    return [User.id != user_id, User.role == UserRole.SEEKER, User.is_active.is_(True),
            User.is_email_verified.is_(True), User.is_deleted.is_(False),
            User.is_profile_complete.is_(True), User.seeker_preferences["occupation"].astext.is_not(None)]


def visible_rooms():
    return [Listing.is_deleted.is_(False), Listing.is_available.is_(True),
            Listing.owner.has(User.is_active.is_(True) & User.is_deleted.is_(False))]


async def page_of(db, model, filters, page, page_size, order):
    total = (await db.execute(select(func.count()).select_from(model).where(*filters))).scalar_one()
    statement = select(model).where(*filters).order_by(*order).offset((page - 1) * page_size).limit(page_size)
    if model is Listing:
        statement = statement.options(selectinload(Listing.owner), selectinload(Listing.images))
    records = (await db.execute(statement)).scalars().all()
    return {"items": [PublicListingResponse.model_validate(record) if model is Listing else roommate(record) for record in records],
            "total": total, "page": page, "pages": (total + page_size - 1) // page_size}


@router.get("")
async def dashboard(db: DbDep, current_user: CurrentUser, response: Response,
                    city: str = Query(default="", max_length=100), area: str = Query(default="", max_length=100),
                    room_page: int = Query(default=1, ge=1), roommate_page: int = Query(default=1, ge=1),
                    location: str = Query(default="", max_length=200),
                    min_rent: int | None = Query(default=None, ge=0, le=100_000_000_000),
                    max_rent: int | None = Query(default=None, ge=0, le=100_000_000_000),
                    property_type: PropertyType | None = None,
                    amenities: str = Query(default="", max_length=500), available_by: date | None = None,
                    min_budget: int | None = Query(default=None, ge=0, le=1_000_000_000),
                    max_budget: int | None = Query(default=None, ge=0, le=1_000_000_000),
                    sleep_schedule: Literal["early_bird", "night_owl", "flexible"] | None = None,
                    cleanliness: Literal["very_tidy", "moderate", "relaxed"] | None = None,
                    move_in_timeline: Literal["within_1_month", "within_3_months", "within_6_months", "flexible"] | None = None,
                    page_size: int = Query(default=3, ge=1, le=30), mode: Literal["all", "saved", "matches"] = "all"):
    response.headers["Cache-Control"] = "no-store"
    room_filters, person_filters = visible_rooms(), visible_roommates(current_user.id)
    for value, room_column in ((city.strip(), Listing.city), (area.strip(), Listing.address)):
        if value:
            room_filters.append(func.lower(room_column).contains(value.lower(), autoescape=True))
            person_filters.append(func.lower(User.seeker_preferences["preferred_location"].astext).contains(value.lower(), autoescape=True))
    if location.strip():
        term = location.strip().lower()
        room_filters.append(or_(*(func.lower(column).contains(term, autoescape=True)
                                  for column in (Listing.city, Listing.address, Listing.state))))
        person_filters.append(func.lower(User.seeker_preferences["preferred_location"].astext).contains(term, autoescape=True))
    for minimum, maximum in ((min_rent, max_rent), (min_budget, max_budget)):
        if minimum is not None and maximum is not None and minimum > maximum:
            raise HTTPException(422, "Minimum price must not exceed maximum price.")
    if min_rent is not None:
        room_filters.append(Listing.monthly_rent >= min_rent)
    if max_rent is not None:
        room_filters.append(Listing.monthly_rent <= max_rent)
    if property_type:
        room_filters.append(Listing.property_type == property_type)
    selected_amenities = list(dict.fromkeys(item.strip().lower() for item in amenities.split(",") if item.strip()))
    if len(selected_amenities) > 10 or any(len(item) > 60 for item in selected_amenities):
        raise HTTPException(422, "Choose up to 10 amenities, each no longer than 60 characters.")
    stored_amenities = func.regexp_split_to_array(func.lower(func.trim(func.coalesce(Listing.amenities, ""))), r"\s*,\s*")
    room_filters.extend(item == any_(stored_amenities) for item in selected_amenities)
    if available_by:
        room_filters.append(or_(Listing.available_from.is_(None),
            Listing.available_from <= datetime.combine(available_by, time.max, tzinfo=timezone.utc)))
    # A roommate's budget range must overlap the searcher's requested range.
    if min_budget is not None:
        person_filters.append(cast(User.seeker_preferences["budget_max"].astext, Integer) >= min_budget)
    if max_budget is not None:
        person_filters.append(cast(User.seeker_preferences["budget_min"].astext, Integer) <= max_budget)
    for key, value in (("sleep_schedule", sleep_schedule), ("cleanliness", cleanliness), ("move_in_timeline", move_in_timeline)):
        if value:
            person_filters.append(User.seeker_preferences[key].astext == value)
    bookmarks = (await db.execute(select(DashboardBookmark).where(DashboardBookmark.user_id == current_user.id))).scalars().all()
    room_ids = [b.target_id for b in bookmarks if b.kind == "room"]
    person_ids = [b.target_id for b in bookmarks if b.kind == "roommate"]
    if mode == "saved":
        room_filters.append(Listing.id.in_(room_ids))
        person_filters.append(User.id.in_(person_ids))
    preferences = current_user.seeker_preferences or {}
    matching = [User.seeker_preferences[key].astext == preferences[key]
                for key in ("sleep_schedule", "cleanliness") if preferences.get(key)]
    # Only describe a lifestyle match when both choices are supplied and match.
    match_filters = visible_roommates(current_user.id) + (matching if len(matching) == 2 else [False])
    match_count = (await db.execute(select(func.count()).select_from(User).where(*match_filters))).scalar_one()
    if mode == "matches":
        person_filters.extend(match_filters)
    order = ([case((condition, 1), else_=0).desc() for condition in matching] + [User.updated_at.desc(), User.id])
    rooms = await page_of(db, Listing, room_filters, room_page, page_size, [Listing.created_at.desc(), Listing.id])
    roommates = await page_of(db, User, person_filters, roommate_page, page_size, order)
    recent_rooms = (await db.execute(select(Listing).join(DashboardBookmark, DashboardBookmark.target_id == Listing.id)
        .where(DashboardBookmark.user_id == current_user.id, DashboardBookmark.kind == "room", *visible_rooms())
        .options(selectinload(Listing.owner), selectinload(Listing.images))
        .order_by(DashboardBookmark.created_at.desc()).limit(2))).scalars().all()
    searches = (await db.execute(select(DashboardSearch).where(DashboardSearch.user_id == current_user.id)
        .order_by(DashboardSearch.created_at.desc(), DashboardSearch.id.desc()).limit(5))).scalars().all()
    return {"user": UserSelfResponse.model_validate(current_user), "rooms": rooms, "roommates": roommates,
            "saved": [{"kind": b.kind, "id": b.target_id} for b in bookmarks],
            "recent_saved": [PublicListingResponse.model_validate(item) for item in recent_rooms],
            "searches": [{"id": s.id, "city": s.city, "area": s.area, "kind": s.kind} for s in searches],
            "match_count": match_count}


@router.put("/saved/{kind}/{target_id}")
async def save(kind: Kind, target_id: str, db: DbDep, current_user: CurrentUser):
    if kind == "room":
        try:
            target_id = str(UUID(target_id))
        except ValueError:
            raise HTTPException(404, "Room not found.")
        model, filters = Listing, visible_rooms()
    else:
        model, filters = User, visible_roommates(current_user.id)
    found = (await db.execute(select(model.id).where(model.id == target_id, *filters))).scalar_one_or_none()
    if not found:
        raise HTTPException(404, "This room or roommate is no longer available.")
    await db.execute(insert(DashboardBookmark).values(user_id=current_user.id, kind=kind, target_id=target_id).on_conflict_do_nothing())
    return {"saved": True}


@router.delete("/saved/{kind}/{target_id}")
async def unsave(kind: Kind, target_id: str, db: DbDep, current_user: CurrentUser):
    await db.execute(delete(DashboardBookmark).where(DashboardBookmark.user_id == current_user.id,
        DashboardBookmark.kind == kind, DashboardBookmark.target_id == target_id))
    return {"saved": False}


@router.post("/searches", status_code=201)
async def record_search(body: SearchRequest, db: DbDep, current_user: CurrentUser):
    # Serialize updates per account and retain only the five most recent distinct searches.
    await db.execute(select(User.id).where(User.id == current_user.id).with_for_update())
    await db.execute(delete(DashboardSearch).where(DashboardSearch.user_id == current_user.id,
        DashboardSearch.city == body.city, DashboardSearch.area == body.area, DashboardSearch.kind == body.kind))
    db.add(DashboardSearch(user_id=current_user.id, **body.model_dump()))
    await db.flush()
    keep = select(DashboardSearch.id).where(DashboardSearch.user_id == current_user.id).order_by(
        DashboardSearch.created_at.desc(), DashboardSearch.id.desc()).limit(5)
    await db.execute(delete(DashboardSearch).where(DashboardSearch.user_id == current_user.id, DashboardSearch.id.not_in(keep)))
    return {"message": "Search saved."}
