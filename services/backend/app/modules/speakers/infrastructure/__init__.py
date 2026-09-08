"""Speaker and agenda persistence boundaries."""

from app.modules.speakers.infrastructure.repositories import (
    SessionRepository,
    SpeakerRepository,
)

__all__ = ["SpeakerRepository", "SessionRepository"]
