# =============================================================
# Auth schemas — login, token response, refresh, me
# =============================================================
import uuid
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, EmailStr, Field, ConfigDict


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1)
    mfa_code: Optional[str] = Field(default=None, min_length=6, max_length=6)


class CommandCenterLoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1)
    totp_code: str = Field(min_length=6, max_length=6, pattern=r"^\d{6}$")
    remember_me: bool = False


class CommandCenterTokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int
    user: "UserMeResponse"


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: Optional[str] = None
    token_type: str = "bearer"
    expires_in: int          # seconds until access token expires
    user_id: uuid.UUID
    role: str
    organization_id: uuid.UUID
    user: Optional["UserMeResponse"] = None


class RefreshRequest(BaseModel):
    refresh_token: str


class ChangePasswordRequest(BaseModel):
    current_password: str = Field(min_length=1)
    new_password: str = Field(min_length=8)


class UserMeResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    email: str
    first_name: str
    last_name: str
    role: str
    organization_id: uuid.UUID
    organization_slug: Optional[str] = None
    onboarding_completed: bool = False
    avatar_url: Optional[str] = None
    is_active: bool
    is_platform_admin: bool = False
    last_login_at: Optional[datetime] = None
