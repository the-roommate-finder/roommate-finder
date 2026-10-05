"""Track explicitly completed profile onboarding for both account roles."""
from alembic import op
import sqlalchemy as sa

revision = "a62c4e901b3f"
down_revision = "f3a9c2d1b8e4"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("users", sa.Column(
        "is_profile_complete", sa.Boolean(), nullable=False,
        server_default=sa.text("false"),
    ))


def downgrade() -> None:
    op.drop_column("users", "is_profile_complete")
