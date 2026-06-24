from __future__ import annotations

from typing import Any, Generic, Optional, Type, TypeVar

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import Base

ModelT = TypeVar("ModelT", bound=Base)


class BaseRepository(Generic[ModelT]):
    """
    Type-safe generic repository for SQLAlchemy 2.0 async sessions.

    Subclasses define the concrete model type:
        class UserRepository(BaseRepository[User]):
            model = User
    """

    model: Type[ModelT]

    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def get_by_id(self, record_id: str) -> Optional[ModelT]:
        result = await self.db.execute(
            select(self.model).where(self.model.id == record_id)  # type: ignore[attr-defined]
        )
        return result.scalar_one_or_none()

    async def get_all(
        self,
        *,
        offset: int = 0,
        limit: int = 20,
    ) -> list[ModelT]:
        result = await self.db.execute(
            select(self.model).offset(offset).limit(limit)
        )
        return list(result.scalars().all())

    async def create(self, **kwargs: Any) -> ModelT:
        instance = self.model(**kwargs)  # type: ignore[call-arg]
        self.db.add(instance)
        await self.db.flush()
        await self.db.refresh(instance)
        return instance

    async def update(self, instance: ModelT, **kwargs: Any) -> ModelT:
        for key, value in kwargs.items():
            setattr(instance, key, value)
        await self.db.flush()
        await self.db.refresh(instance)
        return instance

    async def delete(self, instance: ModelT) -> None:
        await self.db.delete(instance)
        await self.db.flush()

    async def count(self, *filters: Any) -> int:
        stmt = select(func.count()).select_from(self.model)
        if filters:
            stmt = stmt.where(*filters)
        result = await self.db.execute(stmt)
        return result.scalar_one()

    async def exists(self, *filters: Any) -> bool:
        return await self.count(*filters) > 0
