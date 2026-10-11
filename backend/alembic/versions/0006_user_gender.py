"""Restrict profile gender to male/female, independently of listing preferences."""
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "c84e6a123d5b"
down_revision = "b73d5f012c4a"
branch_labels = None
depends_on = None

user_gender = postgresql.ENUM("male", "female", name="user_gender", create_type=False)
legacy_gender = postgresql.ENUM("any", "male", "female", "non_binary", name="gender_preference", create_type=False)


def upgrade() -> None:
    user_gender.create(op.get_bind(), checkfirst=True)
    # Never assign a different gender to legacy profiles. Ask them to reselect.
    op.execute("UPDATE users SET gender = NULL, is_profile_complete = false "
               "WHERE gender::text NOT IN ('male', 'female')")
    op.alter_column("users", "gender", existing_type=legacy_gender,
                    type_=user_gender, postgresql_using="gender::text::user_gender")


def downgrade() -> None:
    # Previously cleared selections cannot be reconstructed on downgrade.
    legacy_gender.create(op.get_bind(), checkfirst=True)
    op.alter_column("users", "gender", existing_type=user_gender,
                    type_=legacy_gender, postgresql_using="gender::text::gender_preference")
    user_gender.drop(op.get_bind(), checkfirst=True)
