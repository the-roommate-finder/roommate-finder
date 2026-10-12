"""Persist account notification preferences."""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "a32c0e567b9f"
down_revision = "f21b9d456a8e"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("users", sa.Column("notification_preferences", postgresql.JSONB(),
        server_default=sa.text("'{}'::jsonb"), nullable=False))


def downgrade() -> None:
    op.drop_column("users", "notification_preferences")
