"""Persist profile audience and field visibility preferences."""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "b43d1f678c0a"
down_revision = "a32c0e567b9f"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("users", sa.Column("privacy_preferences", postgresql.JSONB(),
        server_default=sa.text("'{}'::jsonb"), nullable=False))


def downgrade() -> None:
    op.drop_column("users", "privacy_preferences")
