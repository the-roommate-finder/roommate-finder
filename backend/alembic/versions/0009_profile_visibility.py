"""Persist profile discovery visibility."""
from alembic import op
import sqlalchemy as sa

revision = "f21b9d456a8e"
down_revision = "e10a8c345f7d"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("users", sa.Column("is_profile_visible", sa.Boolean(), server_default=sa.true(), nullable=False))


def downgrade() -> None:
    op.drop_column("users", "is_profile_visible")
