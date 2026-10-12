"""Store reports submitted from a chat participant profile."""
from alembic import op
import sqlalchemy as sa

revision = "e10a8c345f7d"
down_revision = "d95f7b234e6c"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table("user_reports",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("reporter_id", sa.String(12), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("reported_id", sa.String(12), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("conversation_id", sa.String(36), sa.ForeignKey("conversations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("reason", sa.String(40), nullable=False),
        sa.Column("details", sa.Text(), nullable=False),
        sa.Column("status", sa.String(20), server_default="pending", nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("reporter_id", "conversation_id", name="uq_reporter_conversation"))


def downgrade() -> None:
    op.drop_table("user_reports")
