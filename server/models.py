from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Index, Integer, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .db import Base


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    email: Mapped[str] = mapped_column(String(320), nullable=False, unique=True, index=True)
    username: Mapped[str] = mapped_column(String(80), nullable=False, unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    department: Mapped[str] = mapped_column(String(64), nullable=False)
    role: Mapped[str] = mapped_column(String(32), nullable=False, default="operator")
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utcnow, onupdate=utcnow)
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    sessions: Mapped[list["AuthSession"]] = relationship(
        back_populates="user",
        cascade="all, delete-orphan",
    )
    detections: Mapped[list["Detection"]] = relationship(
        back_populates="created_by",
    )


class AuthSession(Base):
    __tablename__ = "auth_sessions"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    token_hash: Mapped[str] = mapped_column(String(64), nullable=False, unique=True, index=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utcnow)
    last_seen_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utcnow)

    user: Mapped[User] = relationship(back_populates="sessions")


class Detection(Base):
    __tablename__ = "detections"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    detection_id: Mapped[str] = mapped_column(String(120), nullable=False, unique=True, index=True)
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )

    image_id: Mapped[str] = mapped_column(String(255), nullable=False)
    image_filename: Mapped[str | None] = mapped_column(String(255), nullable=True)
    image_storage_key: Mapped[str | None] = mapped_column(String(500), nullable=True)

    class_name: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    raw_label: Mapped[str | None] = mapped_column(String(128), nullable=True)
    confidence: Mapped[float] = mapped_column(Float, nullable=False)

    bounding_box: Mapped[dict] = mapped_column(JSONB, nullable=False)
    predictions: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)
    gps: Mapped[dict] = mapped_column(JSONB, nullable=False)

    estimated_size: Mapped[dict] = mapped_column(JSONB, nullable=False)
    estimated_weight: Mapped[dict] = mapped_column(JSONB, nullable=False)

    risk_level: Mapped[str] = mapped_column(String(20), nullable=False)
    risk_score: Mapped[float] = mapped_column(Float, nullable=False)
    priority: Mapped[int] = mapped_column(Integer, nullable=False)
    response_deadline: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    department: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    recommended_equipment: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)
    removal_method: Mapped[str] = mapped_column(Text, nullable=False)
    verification_status: Mapped[str] = mapped_column(String(32), nullable=False, default="pending")
    notes: Mapped[str] = mapped_column(Text, nullable=False, default="")

    detection_time: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utcnow, onupdate=utcnow)

    ai_prediction: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    estimated: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    recommended: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    manual_verification_required: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    is_real_model: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    inference_details: Mapped[dict | None] = mapped_column(JSONB, nullable=True)

    created_by: Mapped[User] = relationship(back_populates="detections")

    __table_args__ = (
        Index("ix_detections_user_created_at", "user_id", "created_at"),
        Index("ix_detections_department_created_at", "department", "created_at"),
        UniqueConstraint("detection_id", name="uq_detections_detection_id"),
    )


class Alert(Base):
    """Reserved for the next persistence phase.

    The current UI still manages alert workflow state locally. Keeping the model
    separate means alert persistence can be added without changing the detection
    schema or the future Supabase Storage design.
    """

    __tablename__ = "alerts"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    alert_id: Mapped[str] = mapped_column(String(120), unique=True, nullable=False, index=True)
    detection_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("detections.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="new")
    priority: Mapped[int] = mapped_column(Integer, nullable=False)
    assigned_department: Mapped[str] = mapped_column(String(64), nullable=False)
    assigned_operator: Mapped[str | None] = mapped_column(String(120), nullable=True)
    response_deadline: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    payload: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utcnow, onupdate=utcnow)
