from __future__ import annotations

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "f3a9c2d1b8e4"
down_revision = "84bf014ae9b6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # users: track phone verification status and allow phone-based login
    op.add_column(
        "users",
        sa.Column(
            "is_phone_verified",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
    )
    op.create_unique_constraint(
        "uq_users_phone_number", "users", ["phone_number"]
    )

    # phone_verifications: mirrors email_verifications, keyed by phone_number
    op.create_table(
        "phone_verifications",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("user_id", sa.String(length=36), nullable=False),
        sa.Column("phone_number", sa.String(length=20), nullable=False),
        sa.Column("otp_hash", sa.String(length=64), nullable=False),
        sa.Column("attempts", sa.Integer(), nullable=False),
        sa.Column("is_used", sa.Boolean(), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("used_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_phone_verifications_user_active",
        "phone_verifications",
        ["user_id", "is_used", "expires_at"],
    )
    op.create_index(
        "ix_phone_verifications_phone", "phone_verifications", ["phone_number"]
    )
    op.create_index(
        op.f("ix_phone_verifications_user_id"), "phone_verifications", ["user_id"]
    )


def downgrade() -> None:
    op.drop_index(
        op.f("ix_phone_verifications_user_id"), table_name="phone_verifications"
    )
    op.drop_index("ix_phone_verifications_phone", table_name="phone_verifications")
    op.drop_index(
        "ix_phone_verifications_user_active", table_name="phone_verifications"
    )
    op.drop_table("phone_verifications")

    op.drop_constraint("uq_users_phone_number", "users", type_="unique")
    op.drop_column("users", "is_phone_verified")
