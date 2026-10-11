"""Persist seeker onboarding preferences without changing existing profiles."""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "b73d5f012c4a"
down_revision = "a62c4e901b3f"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("users", sa.Column("seeker_preferences", postgresql.JSONB(), nullable=True))


def downgrade() -> None:
    op.drop_column("users", "seeker_preferences")
