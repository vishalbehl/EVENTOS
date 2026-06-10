import uuid
from datetime import datetime, timezone
from typing import Optional, Dict, Any
from sqlalchemy import String, Text, DateTime, ForeignKey, Boolean, Integer, Numeric
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base

class SpeakerInvitation(Base):
    __tablename__ = "invitations"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    event_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("events.events.id", ondelete="CASCADE"), index=True)
    email: Mapped[str] = mapped_column(String(320), nullable=False)
    status: Mapped[str] = mapped_column(String(50), default="SENT") # SENT, ACCEPTED, DECLINED
    sent_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

class SpeakerUploadToken(Base):
    __tablename__ = "upload_tokens"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    speaker_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("events.speakers.id", ondelete="CASCADE"), index=True)
    token: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    is_used: Mapped[bool] = mapped_column(Boolean, default=False)

class SpeakerTravelRequest(Base):
    __tablename__ = "travel_requests"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    speaker_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("events.speakers.id", ondelete="CASCADE"), index=True)
    origin: Mapped[str] = mapped_column(String(100), nullable=False)
    destination: Mapped[str] = mapped_column(String(100), nullable=False)
    departure_date: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    status: Mapped[str] = mapped_column(String(50), default="PENDING")

class SpeakerAccommodationRequest(Base):
    __tablename__ = "accommodation_requests"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    speaker_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("events.speakers.id", ondelete="CASCADE"), index=True)
    hotel_name: Mapped[Optional[str]] = mapped_column(String(255))
    check_in: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    check_out: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    status: Mapped[str] = mapped_column(String(50), default="PENDING")

class SpeakerHonorarium(Base):
    __tablename__ = "honorariums"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    speaker_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("events.speakers.id", ondelete="CASCADE"), unique=True, index=True)
    amount: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False)
    status: Mapped[str] = mapped_column(String(50), default="PENDING_APPROVAL")

class SpeakerCommunicationHistory(Base):
    __tablename__ = "communication_history"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    speaker_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("events.speakers.id", ondelete="CASCADE"), index=True)
    subject: Mapped[str] = mapped_column(String(255), nullable=False)
    message_type: Mapped[str] = mapped_column(String(50), default="EMAIL") # EMAIL, SMS, WHATSAPP
    sent_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

class SpeakerProfileVersion(Base):
    __tablename__ = "profile_versions"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    speaker_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("events.speakers.id", ondelete="CASCADE"), index=True)
    bio: Mapped[Optional[str]] = mapped_column(Text)
    profile_data: Mapped[Dict[str, Any]] = mapped_column(JSONB, default=dict)
    version_number: Mapped[int] = mapped_column(Integer, default=1)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
