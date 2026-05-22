from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import APIKeyHeader
from pydantic import BaseModel
from typing import Annotated

from app.config import settings

router = APIRouter(prefix="/api/v1/auth", tags=["auth"])

X_VENUE_KEY = APIKeyHeader(name="X-Venue-Key", auto_error=False)

def verify_device(key: str = Depends(X_VENUE_KEY)) -> bool:
    if not key or key != settings.VENUE_AUTH_KEY:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or missing Venue Key. Please scan the QR code on the Venue Server.",
        )
    return True

DeviceAuth = Annotated[bool, Depends(verify_device)]

class AuthStatus(BaseModel):
    authenticated: bool
    message: str

@router.get("/verify", response_model=AuthStatus)
async def verify_connection(is_auth: DeviceAuth):
    """
    Devices (Room App, Kiosk) hit this to verify their venue key is correct.
    """
    return AuthStatus(authenticated=True, message="Connected to Venue Server successfully")
