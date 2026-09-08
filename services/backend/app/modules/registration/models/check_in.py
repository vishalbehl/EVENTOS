"""
Participant CheckIn compatibility module.
Consolidated into venue.venue_checkins (VenueCheckIn).
"""
from app.modules.venue.models.registration_execution import VenueCheckIn

CheckIn = VenueCheckIn

__all__ = ["CheckIn", "VenueCheckIn"]
