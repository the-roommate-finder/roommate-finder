"""Persist seeker bookmarks and recent searches."""
from alembic import op
import sqlalchemy as sa

revision = "d95f7b234e6c"
down_revision = "c84e6a123d5b"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table("dashboard_bookmarks",
        sa.Column("user_id", sa.String(12), sa.ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("kind", sa.String(8), primary_key=True),
        sa.Column("target_id", sa.String(36), primary_key=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False))
    op.create_table("dashboard_searches",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("user_id", sa.String(12), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("city", sa.String(100), nullable=False),
        sa.Column("area", sa.String(100), nullable=False),
        sa.Column("kind", sa.String(8), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.clock_timestamp(), nullable=False))
    op.create_index("ix_dashboard_searches_user_id", "dashboard_searches", ["user_id"])


def downgrade() -> None:
    op.drop_table("dashboard_searches")
    op.drop_table("dashboard_bookmarks")
