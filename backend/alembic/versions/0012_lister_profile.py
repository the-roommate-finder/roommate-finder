"""Store lister profile details and the uploaded property logo."""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "c54e2a789d1b"
down_revision = "b43d1f678c0a"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("users", sa.Column("lister_profile", postgresql.JSONB(), nullable=True))
    op.add_column("users", sa.Column("property_logo_url", sa.String(500), nullable=True))


def downgrade() -> None:
    op.drop_column("users", "property_logo_url")
    op.drop_column("users", "lister_profile")
