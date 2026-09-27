"""initial auth and detection schema

Revision ID: 0001_initial
Revises:
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0001_initial"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("email", sa.String(320), nullable=False),
        sa.Column("username", sa.String(80), nullable=False),
        sa.Column("password_hash", sa.String(255), nullable=False),
        sa.Column("department", sa.String(64), nullable=False),
        sa.Column("role", sa.String(32), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("last_login_at", sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("email"),
        sa.UniqueConstraint("username"),
    )

    op.create_table(
        "auth_sessions",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("token_hash", sa.String(64), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("last_seen_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("token_hash"),
    )
    op.create_index("ix_auth_sessions_token_hash", "auth_sessions", ["token_hash"])
    op.create_index("ix_auth_sessions_user_id", "auth_sessions", ["user_id"])
    op.create_index("ix_auth_sessions_expires_at", "auth_sessions", ["expires_at"])

    op.create_table(
        "detections",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("detection_id", sa.String(120), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("image_id", sa.String(255), nullable=False),
        sa.Column("image_filename", sa.String(255)),
        sa.Column("image_storage_key", sa.String(500)),
        sa.Column("class_name", sa.String(64), nullable=False),
        sa.Column("raw_label", sa.String(128)),
        sa.Column("confidence", sa.Float(), nullable=False),
        sa.Column("bounding_box", postgresql.JSONB(), nullable=False),
        sa.Column("predictions", postgresql.JSONB(), nullable=False),
        sa.Column("gps", postgresql.JSONB(), nullable=False),
        sa.Column("estimated_size", postgresql.JSONB(), nullable=False),
        sa.Column("estimated_weight", postgresql.JSONB(), nullable=False),
        sa.Column("risk_level", sa.String(20), nullable=False),
        sa.Column("risk_score", sa.Float(), nullable=False),
        sa.Column("priority", sa.Integer(), nullable=False),
        sa.Column("response_deadline", sa.DateTime(timezone=True), nullable=False),
        sa.Column("department", sa.String(64), nullable=False),
        sa.Column("recommended_equipment", postgresql.JSONB(), nullable=False),
        sa.Column("removal_method", sa.Text(), nullable=False),
        sa.Column("verification_status", sa.String(32), nullable=False),
        sa.Column("notes", sa.Text(), nullable=False),
        sa.Column("detection_time", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("ai_prediction", sa.Boolean(), nullable=False),
        sa.Column("estimated", sa.Boolean(), nullable=False),
        sa.Column("recommended", sa.Boolean(), nullable=False),
        sa.Column("manual_verification_required", sa.Boolean(), nullable=False),
        sa.Column("is_real_model", sa.Boolean(), nullable=False),
        sa.Column("inference_details", postgresql.JSONB()),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("detection_id"),
    )
    op.create_index("ix_detections_user_id", "detections", ["user_id"])
    op.create_index("ix_detections_class_name", "detections", ["class_name"])
    op.create_index("ix_detections_department", "detections", ["department"])
    op.create_index("ix_detections_user_created_at", "detections", ["user_id", "created_at"])

    op.create_table(
        "alerts",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("alert_id", sa.String(120), nullable=False),
        sa.Column("detection_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("status", sa.String(32), nullable=False),
        sa.Column("priority", sa.Integer(), nullable=False),
        sa.Column("assigned_department", sa.String(64), nullable=False),
        sa.Column("assigned_operator", sa.String(120)),
        sa.Column("response_deadline", sa.DateTime(timezone=True), nullable=False),
        sa.Column("payload", postgresql.JSONB(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["detection_id"], ["detections.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("alert_id"),
    )


def downgrade() -> None:
    op.drop_table("alerts")
    op.drop_index("ix_detections_user_created_at", table_name="detections")
    op.drop_index("ix_detections_department", table_name="detections")
    op.drop_index("ix_detections_class_name", table_name="detections")
    op.drop_index("ix_detections_user_id", table_name="detections")
    op.drop_table("detections")
    op.drop_index("ix_auth_sessions_expires_at", table_name="auth_sessions")
    op.drop_index("ix_auth_sessions_user_id", table_name="auth_sessions")
    op.drop_index("ix_auth_sessions_token_hash", table_name="auth_sessions")
    op.drop_table("auth_sessions")
    op.drop_table("users")
