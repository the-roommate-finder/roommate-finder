from __future__ import annotations

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    # RMF User ID sequence 
    # Must be created BEFORE the users table that references it.
    op.execute("CREATE SEQUENCE IF NOT EXISTS rmf_user_seq START 1 INCREMENT 1")

    #  Enums 
    op.execute("""
        DO $$ BEGIN
            CREATE TYPE user_role AS ENUM ('seeker', 'lister', 'admin');
        EXCEPTION WHEN duplicate_object THEN NULL;
        END $$
    """)
    op.execute("""
        DO $$ BEGIN
            CREATE TYPE gender_preference AS ENUM ('any', 'male', 'female', 'non_binary');
        EXCEPTION WHEN duplicate_object THEN NULL;
        END $$
    """)
    op.execute("""
        DO $$ BEGIN
            CREATE TYPE gender_preference_listing AS ENUM ('any', 'male', 'female', 'non_binary');
        EXCEPTION WHEN duplicate_object THEN NULL;
        END $$
    """)
    op.execute("""
        DO $$ BEGIN
            CREATE TYPE property_type AS ENUM ('apartment', 'house', 'studio', 'room', 'shared');
        EXCEPTION WHEN duplicate_object THEN NULL;
        END $$
    """)
    op.execute("""
        DO $$ BEGIN
            CREATE TYPE call_type AS ENUM ('audio', 'video');
        EXCEPTION WHEN duplicate_object THEN NULL;
        END $$
    """)
    op.execute("""
        DO $$ BEGIN
            CREATE TYPE call_status AS ENUM ('initiated', 'ringing', 'accepted', 'rejected', 'missed', 'ended', 'failed');
        EXCEPTION WHEN duplicate_object THEN NULL;
        END $$
    """)
    op.execute("""
        DO $$ BEGIN
            CREATE TYPE message_type AS ENUM ('text', 'image', 'voice', 'call_log', 'system');
        EXCEPTION WHEN duplicate_object THEN NULL;
        END $$
    """)
    op.execute("""
        DO $$ BEGIN
            CREATE TYPE notification_type AS ENUM ('new_message', 'listing_inquiry', 'saved_listing_update', 'security_alert', 'verification', 'call_missed', 'system');
        EXCEPTION WHEN duplicate_object THEN NULL;
        END $$
    """)
    op.execute("""
        DO $$ BEGIN
            CREATE TYPE security_event_type AS ENUM ('login_success', 'login_failed', 'account_locked', 'password_changed', 'otp_verified', 'token_revoked', 'logout', 'suspicious_activity');
        EXCEPTION WHEN duplicate_object THEN NULL;
        END $$
    """)

    #  users 
    op.create_table(
        "users",
        sa.Column(
            "id",
            sa.String(12),
            primary_key=True,
            server_default=sa.text("'RMF-' || lpad(nextval('rmf_user_seq')::text, 6, '0')"),
        ),
        sa.Column("email", sa.String(255), nullable=False),
        sa.Column("hashed_password", sa.String(255), nullable=False),
        sa.Column("role", postgresql.ENUM("seeker", "lister", "admin", name="user_role", create_type=False), nullable=False, server_default="seeker"),
        sa.Column("display_name", sa.String(100)),
        sa.Column("bio", sa.Text),
        sa.Column("avatar_url", sa.String(500)),
        sa.Column("phone_number", sa.String(20)),
        sa.Column("gender", postgresql.ENUM("any", "male", "female", "non_binary", name="gender_preference", create_type=False)),
        sa.Column("date_of_birth", sa.DateTime(timezone=True)),
        sa.Column("is_active", sa.Boolean, nullable=False, server_default="false"),
        sa.Column("is_email_verified", sa.Boolean, nullable=False, server_default="false"),
        sa.Column("is_deleted", sa.Boolean, nullable=False, server_default="false"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("last_active_at", sa.DateTime(timezone=True)),
        sa.Column("deleted_at", sa.DateTime(timezone=True)),
    )
    op.create_index("ix_users_email", "users", ["email"], unique=True)
    op.create_index("ix_users_id", "users", ["id"])
    op.create_index("ix_users_email_active", "users", ["email", "is_active"])
    op.create_index("ix_users_role", "users", ["role"])

    #  email_verifications 
    op.create_table(
        "email_verifications",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("user_id", sa.String(12), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("otp_hash", sa.String(64), nullable=False),
        sa.Column("attempts", sa.Integer, nullable=False, server_default="0"),
        sa.Column("is_used", sa.Boolean, nullable=False, server_default="false"),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("used_at", sa.DateTime(timezone=True)),
    )
    op.create_index("ix_email_verifications_user_id", "email_verifications", ["user_id"])
    op.create_index("ix_email_verifications_user_active", "email_verifications", ["user_id", "is_used", "expires_at"])

    #  login_attempts 
    op.create_table(
        "login_attempts",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("user_id", sa.String(12), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("email", sa.String(255), nullable=False),
        sa.Column("ip_address", sa.String(45), nullable=False),
        sa.Column("user_agent", sa.String(500)),
        sa.Column("device_fingerprint", sa.String(64)),
        sa.Column("is_success", sa.Boolean, nullable=False),
        sa.Column("failure_reason", sa.String(100)),
        sa.Column("location", sa.String(200)),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_login_attempts_user_id", "login_attempts", ["user_id"])
    op.create_index("ix_login_attempts_email", "login_attempts", ["email"])
    op.create_index("ix_login_attempts_email_created", "login_attempts", ["email", "created_at"])
    op.create_index("ix_login_attempts_ip", "login_attempts", ["ip_address"])

    #  devices 
    op.create_table(
        "devices",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("user_id", sa.String(12), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("fingerprint", sa.String(64), nullable=False),
        sa.Column("name", sa.String(200)),
        sa.Column("browser", sa.String(100)),
        sa.Column("os", sa.String(100)),
        sa.Column("device_type", sa.String(50)),
        sa.Column("is_trusted", sa.Boolean, nullable=False, server_default="false"),
        sa.Column("last_seen_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("user_id", "fingerprint", name="uq_device_user_fingerprint"),
    )
    op.create_index("ix_devices_user_id", "devices", ["user_id"])
    op.create_index("ix_devices_user_fingerprint", "devices", ["user_id", "fingerprint"])

    #  user_sessions 
    op.create_table(
        "user_sessions",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("user_id", sa.String(12), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("device_id", sa.String(36), sa.ForeignKey("devices.id", ondelete="SET NULL"), nullable=True),
        sa.Column("session_token_hash", sa.String(64), unique=True, nullable=False),
        sa.Column("ip_address", sa.String(45), nullable=False),
        sa.Column("user_agent", sa.String(500)),
        sa.Column("location", sa.String(200)),
        sa.Column("is_active", sa.Boolean, nullable=False, server_default="true"),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("last_used_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_user_sessions_user_id", "user_sessions", ["user_id"])
    op.create_index("ix_user_sessions_user_active", "user_sessions", ["user_id", "is_active"])

    #  refresh_tokens 
    op.create_table(
        "refresh_tokens",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("user_id", sa.String(12), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("token_hash", sa.String(64), unique=True, nullable=False),
        sa.Column("device_id", sa.String(36), sa.ForeignKey("devices.id", ondelete="SET NULL"), nullable=True),
        sa.Column("is_revoked", sa.Boolean, nullable=False, server_default="false"),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("last_used_at", sa.DateTime(timezone=True)),
        sa.Column("revoked_at", sa.DateTime(timezone=True)),
    )
    op.create_index("ix_refresh_tokens_user_id", "refresh_tokens", ["user_id"])
    op.create_index("ix_refresh_tokens_token_hash", "refresh_tokens", ["token_hash"])

    #  security_events 
    op.create_table(
        "security_events",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("user_id", sa.String(12), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("event_type", postgresql.ENUM("login_success", "login_failed", "account_locked", "password_changed", "otp_verified", "token_revoked", "logout", "suspicious_activity", name="security_event_type", create_type=False), nullable=False),
        sa.Column("ip_address", sa.String(45)),
        sa.Column("user_agent", sa.String(500)),
        sa.Column("location", sa.String(200)),
        sa.Column("metadata", sa.Text),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_security_events_user_id", "security_events", ["user_id"])
    op.create_index("ix_security_events_user_type", "security_events", ["user_id", "event_type"])
    op.create_index("ix_security_events_created", "security_events", ["created_at"])

    #  listings 
    op.create_table(
        "listings",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("owner_id", sa.String(12), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("title", sa.String(200), nullable=False),
        sa.Column("description", sa.Text, nullable=False),
        sa.Column("property_type", postgresql.ENUM("apartment", "house", "studio", "room", "shared", name="property_type", create_type=False), nullable=False),
        sa.Column("address", sa.String(500), nullable=False),
        sa.Column("city", sa.String(100), nullable=False),
        sa.Column("state", sa.String(100), nullable=False),
        sa.Column("country", sa.String(100), nullable=False),
        sa.Column("latitude", sa.Float),
        sa.Column("longitude", sa.Float),
        sa.Column("monthly_rent", sa.Integer, nullable=False),
        sa.Column("security_deposit", sa.Integer),
        sa.Column("utilities_included", sa.Boolean, nullable=False, server_default="false"),
        sa.Column("gender_preference", postgresql.ENUM("any", "male", "female", "non_binary", name="gender_preference_listing", create_type=False), nullable=False, server_default="any"),
        sa.Column("max_occupants", sa.Integer, nullable=False, server_default="1"),
        sa.Column("available_from", sa.DateTime(timezone=True)),
        sa.Column("amenities", sa.Text),
        sa.Column("is_available", sa.Boolean, nullable=False, server_default="true"),
        sa.Column("is_deleted", sa.Boolean, nullable=False, server_default="false"),
        sa.Column("view_count", sa.Integer, nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("deleted_at", sa.DateTime(timezone=True)),
    )
    op.create_index("ix_listings_owner", "listings", ["owner_id"])
    op.create_index("ix_listings_city_available", "listings", ["city", "is_available", "is_deleted"])
    op.create_index("ix_listings_rent", "listings", ["monthly_rent"])
    op.create_index("ix_listings_created", "listings", ["created_at"])

    #  listing_images 
    op.create_table(
        "listing_images",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("listing_id", sa.String(36), sa.ForeignKey("listings.id", ondelete="CASCADE"), nullable=False),
        sa.Column("storage_key", sa.String(500), nullable=False),
        sa.Column("thumbnail_key", sa.String(500)),
        sa.Column("cdn_url", sa.String(1000)),
        sa.Column("thumbnail_cdn_url", sa.String(1000)),
        sa.Column("original_filename", sa.String(255)),
        sa.Column("content_type", sa.String(50), nullable=False),
        sa.Column("file_size", sa.BigInteger, nullable=False),
        sa.Column("sort_order", sa.Integer, nullable=False, server_default="0"),
        sa.Column("is_primary", sa.Boolean, nullable=False, server_default="false"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_listing_images_listing_id", "listing_images", ["listing_id"])

    #  chat_keys 
    op.create_table(
        "chat_keys",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("user_id", sa.String(12), sa.ForeignKey("users.id", ondelete="CASCADE"), unique=True, nullable=False),
        sa.Column("public_key", sa.Text, nullable=False),
        sa.Column("key_version", sa.Integer, nullable=False, server_default="1"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )

    #  conversations 
    op.create_table(
        "conversations",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("is_group", sa.Boolean, nullable=False, server_default="false"),
        sa.Column("last_message_at", sa.DateTime(timezone=True)),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_conversations_last_message", "conversations", ["last_message_at"])

    #  conversation_participants 
    op.create_table(
        "conversation_participants",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("conversation_id", sa.String(36), sa.ForeignKey("conversations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("user_id", sa.String(12), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("is_muted", sa.Boolean, nullable=False, server_default="false"),
        sa.Column("is_archived", sa.Boolean, nullable=False, server_default="false"),
        sa.Column("is_pinned", sa.Boolean, nullable=False, server_default="false"),
        sa.Column("unread_count", sa.Integer, nullable=False, server_default="0"),
        sa.Column("last_read_at", sa.DateTime(timezone=True)),
        sa.Column("joined_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("conversation_id", "user_id", name="uq_conversation_participant"),
    )
    op.create_index("ix_conv_participants_conversation_id", "conversation_participants", ["conversation_id"])
    op.create_index("ix_conv_participant_user", "conversation_participants", ["user_id"])

    #  messages 
    op.create_table(
        "messages",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("conversation_id", sa.String(36), sa.ForeignKey("conversations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("sender_id", sa.String(12), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("message_type", postgresql.ENUM("text", "image", "voice", "call_log", "system", name="message_type", create_type=False), nullable=False, server_default="text"),
        sa.Column("encrypted_content", sa.Text),
        sa.Column("encryption_nonce", sa.String(100)),
        sa.Column("is_edited", sa.Boolean, nullable=False, server_default="false"),
        sa.Column("is_deleted", sa.Boolean, nullable=False, server_default="false"),
        sa.Column("edited_at", sa.DateTime(timezone=True)),
        sa.Column("deleted_at", sa.DateTime(timezone=True)),
        sa.Column("delivered_at", sa.DateTime(timezone=True)),
        sa.Column("seen_at", sa.DateTime(timezone=True)),
        sa.Column("reply_to_id", sa.String(36), sa.ForeignKey("messages.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_messages_conversation_id", "messages", ["conversation_id"])
    op.create_index("ix_messages_sender", "messages", ["sender_id"])
    op.create_index("ix_messages_conversation_created", "messages", ["conversation_id", "created_at"])

    #  message_attachments 
    op.create_table(
        "message_attachments",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("message_id", sa.String(36), sa.ForeignKey("messages.id", ondelete="CASCADE"), nullable=False),
        sa.Column("storage_key", sa.String(500), nullable=False),
        sa.Column("cdn_url", sa.String(1000)),
        sa.Column("thumbnail_key", sa.String(500)),
        sa.Column("content_type", sa.String(50), nullable=False),
        sa.Column("file_size", sa.BigInteger, nullable=False),
        sa.Column("original_filename", sa.String(255)),
        sa.Column("is_encrypted", sa.Boolean, nullable=False, server_default="true"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_message_attachments_message_id", "message_attachments", ["message_id"])

    #  voice_messages 
    op.create_table(
        "voice_messages",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("message_id", sa.String(36), sa.ForeignKey("messages.id", ondelete="CASCADE"), unique=True, nullable=False),
        sa.Column("storage_key", sa.String(500), nullable=False),
        sa.Column("cdn_url", sa.String(1000)),
        sa.Column("duration_seconds", sa.Integer, nullable=False),
        sa.Column("content_type", sa.String(50), nullable=False),
        sa.Column("file_size", sa.BigInteger, nullable=False),
        sa.Column("is_encrypted", sa.Boolean, nullable=False, server_default="true"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )

    #  message_reactions 
    op.create_table(
        "message_reactions",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("message_id", sa.String(36), sa.ForeignKey("messages.id", ondelete="CASCADE"), nullable=False),
        sa.Column("user_id", sa.String(12), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("emoji", sa.String(10), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("message_id", "user_id", "emoji", name="uq_reaction_message_user_emoji"),
    )
    op.create_index("ix_message_reactions_message_id", "message_reactions", ["message_id"])
    op.create_index("ix_message_reactions_user_id", "message_reactions", ["user_id"])

    #  blocked_users 
    op.create_table(
        "blocked_users",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("blocker_id", sa.String(12), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("blocked_id", sa.String(12), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("reason", sa.String(500)),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("blocker_id", "blocked_id", name="uq_blocked_user"),
    )
    op.create_index("ix_blocked_users_blocker_id", "blocked_users", ["blocker_id"])
    op.create_index("ix_blocked_users_blocked_id", "blocked_users", ["blocked_id"])

    #  call_logs 
    op.create_table(
        "call_logs",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("conversation_id", sa.String(36), sa.ForeignKey("conversations.id", ondelete="SET NULL"), nullable=True),
        sa.Column("caller_id", sa.String(12), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("callee_id", sa.String(12), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("call_type", postgresql.ENUM("audio", "video", name="call_type", create_type=False), nullable=False),
        sa.Column("status", postgresql.ENUM("initiated", "ringing", "accepted", "rejected", "missed", "ended", "failed", name="call_status", create_type=False), nullable=False, server_default="initiated"),
        sa.Column("started_at", sa.DateTime(timezone=True)),
        sa.Column("ended_at", sa.DateTime(timezone=True)),
        sa.Column("duration_seconds", sa.Integer),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_call_logs_caller", "call_logs", ["caller_id", "created_at"])
    op.create_index("ix_call_logs_callee", "call_logs", ["callee_id", "created_at"])

    #  notifications 
    op.create_table(
        "notifications",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("user_id", sa.String(12), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("notification_type", postgresql.ENUM("new_message", "listing_inquiry", "saved_listing_update", "security_alert", "verification", "call_missed", "system", name="notification_type", create_type=False), nullable=False),
        sa.Column("title", sa.String(200), nullable=False),
        sa.Column("body", sa.Text, nullable=False),
        sa.Column("data", sa.Text),
        sa.Column("is_read", sa.Boolean, nullable=False, server_default="false"),
        sa.Column("read_at", sa.DateTime(timezone=True)),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_notifications_user_id", "notifications", ["user_id"])
    op.create_index("ix_notifications_user_unread", "notifications", ["user_id", "is_read", "created_at"])


def downgrade() -> None:
    op.drop_table("notifications")
    op.drop_table("call_logs")
    op.drop_table("blocked_users")
    op.drop_table("message_reactions")
    op.drop_table("voice_messages")
    op.drop_table("message_attachments")
    op.drop_table("messages")
    op.drop_table("conversation_participants")
    op.drop_table("conversations")
    op.drop_table("chat_keys")
    op.drop_table("listing_images")
    op.drop_table("listings")
    op.drop_table("security_events")
    op.drop_table("refresh_tokens")
    op.drop_table("user_sessions")
    op.drop_table("devices")
    op.drop_table("login_attempts")
    op.drop_table("email_verifications")
    op.drop_table("users")
    op.execute("DROP SEQUENCE IF EXISTS rmf_user_seq")

    # Drop enums
    for enum in ["user_role", "gender_preference", "gender_preference_listing",
                 "property_type", "call_type", "call_status", "message_type",
                 "notification_type", "security_event_type"]:
        op.execute(f"DROP TYPE IF EXISTS {enum}")
