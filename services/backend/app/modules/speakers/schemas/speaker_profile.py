import uuid
from datetime import datetime
from typing import List, Optional
from pydantic import BaseModel, ConfigDict, Field, computed_field


class SpeakerProfileCreate(BaseModel):
    speaker_id: uuid.UUID
    event_id: uuid.UUID
    bio: Optional[str] = None
    extended_bio: Optional[str] = None
    profile_photo_url: Optional[str] = None
    cv_url: Optional[str] = None
    designation: Optional[str] = Field(None, max_length=50)
    title: Optional[str] = Field(None, max_length=200)
    organisation_name: Optional[str] = Field(None, max_length=200)
    department: Optional[str] = Field(None, max_length=200)
    city: Optional[str] = Field(None, max_length=100)
    country: Optional[str] = Field(None, max_length=100)
    website_url: Optional[str] = None
    linkedin_url: Optional[str] = None
    twitter_url: Optional[str] = None
    research_interests: List[str] = Field(default_factory=list)
    languages_spoken: List[str] = Field(default_factory=list)
    photo_consent: bool = False
    last_updated_by: str = "organiser"


class SpeakerProfileUpdate(BaseModel):
    bio: Optional[str] = None
    extended_bio: Optional[str] = None
    profile_photo_url: Optional[str] = None
    cv_url: Optional[str] = None
    designation: Optional[str] = Field(None, max_length=50)
    title: Optional[str] = Field(None, max_length=200)
    organisation_name: Optional[str] = Field(None, max_length=200)
    department: Optional[str] = Field(None, max_length=200)
    city: Optional[str] = Field(None, max_length=100)
    country: Optional[str] = Field(None, max_length=100)
    website_url: Optional[str] = None
    linkedin_url: Optional[str] = None
    twitter_url: Optional[str] = None
    research_interests: Optional[List[str]] = None
    languages_spoken: Optional[List[str]] = None
    photo_consent: Optional[bool] = None


class SpeakerProfileResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    speaker_id: uuid.UUID
    event_id: uuid.UUID
    organization_id: uuid.UUID
    bio: Optional[str] = None
    extended_bio: Optional[str] = None
    profile_photo_url: Optional[str] = None
    cv_url: Optional[str] = None
    designation: Optional[str] = None
    title: Optional[str] = None
    organisation_name: Optional[str] = None
    department: Optional[str] = None
    city: Optional[str] = None
    country: Optional[str] = None
    website_url: Optional[str] = None
    linkedin_url: Optional[str] = None
    twitter_url: Optional[str] = None
    research_interests: List[str] = Field(default_factory=list)
    languages_spoken: List[str] = Field(default_factory=list)
    photo_consent: bool
    last_updated_by: str
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    @computed_field
    @property
    def profile_completeness(self) -> int:
        score = 0
        if self.profile_photo_url and self.profile_photo_url.strip():
            score += 20
        if self.bio and self.bio.strip():
            words = [w for w in self.bio.split() if w.strip()]
            if len(words) > 20:
                score += 25
        if (self.designation and self.designation.strip()) and (self.organisation_name and self.organisation_name.strip()):
            score += 15
        if (
            (self.website_url and self.website_url.strip())
            or (self.linkedin_url and self.linkedin_url.strip())
            or (self.twitter_url and self.twitter_url.strip())
        ):
            score += 10
        if self.extended_bio and self.extended_bio.strip():
            words = [w for w in self.extended_bio.split() if w.strip()]
            if len(words) > 50:
                score += 20
        if self.research_interests:
            valid_interests = [item for item in self.research_interests if item.strip()]
            if len(valid_interests) >= 2:
                score += 10
        return score
