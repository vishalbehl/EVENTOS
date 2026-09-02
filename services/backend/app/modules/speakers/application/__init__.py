"""Application-layer use cases for the speaker domain."""

from app.modules.speakers.application.commands import SpeakerCommandService
from app.modules.speakers.application.queries import SpeakerQueryService

__all__ = ["SpeakerCommandService", "SpeakerQueryService"]
