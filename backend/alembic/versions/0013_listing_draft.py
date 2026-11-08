"""Store the private, in-progress listing form for each lister."""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "d65f3b890e2c"
down_revision = "c54e2a789d1b"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("users", sa.Column("listing_draft", postgresql.JSONB(), nullable=True))


def downgrade() -> None:
    op.drop_column("users", "listing_draft")
