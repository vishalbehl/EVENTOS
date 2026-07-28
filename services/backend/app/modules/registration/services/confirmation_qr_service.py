from __future__ import annotations

import hashlib
import hmac
import re
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.modules.registration.models.confirmation_qr import RegistrationConfirmationQR
from app.modules.registration.models.participant import Participant


_TOKEN_PATTERN = re.compile(
    r"^qrc_([0-9a-f]{32})_([1-9][0-9]*)_([0-9a-f]{40})$"
)


class ConfirmationQRCredentialError(ValueError):
    pass


def _signature(credential_id: uuid.UUID, version: int) -> str:
    payload = f"registration-confirmation:{credential_id.hex}:{version}".encode(
        "utf-8"
    )
    return hmac.new(
        settings.JWT_SECRET_KEY.encode("utf-8"),
        payload,
        hashlib.sha256,
    ).hexdigest()[:40]


def build_confirmation_token(credential_id: uuid.UUID, version: int) -> str:
    if version < 1:
        raise ConfirmationQRCredentialError(
            "Confirmation QR version must be positive."
        )
    return f"qrc_{credential_id.hex}_{version}_{_signature(credential_id, version)}"


def parse_and_verify_confirmation_token(token: str) -> tuple[uuid.UUID, int]:
    match = _TOKEN_PATTERN.fullmatch((token or "").strip().lower())
    if not match:
        raise ConfirmationQRCredentialError(
            "Invalid registration confirmation credential."
        )
    credential_id = uuid.UUID(hex=match.group(1))
    version = int(match.group(2))
    if not hmac.compare_digest(match.group(3), _signature(credential_id, version)):
        raise ConfirmationQRCredentialError(
            "Invalid registration confirmation credential."
        )
    return credential_id, version


def build_confirmation_verification_url(token: str) -> str:
    return (
        f"{settings.API_BASE_URL.rstrip('/')}/api/v1/public/"
        f"registration-confirmations/{token}"
    )


def build_confirmation_image_url(token: str) -> str:
    return f"{build_confirmation_verification_url(token)}/image"


@dataclass(frozen=True)
class ConfirmationQRIssueResult:
    credential: RegistrationConfirmationQR
    old_state: dict | None
    replayed: bool


class RegistrationConfirmationQRService:
    @staticmethod
    async def issue_or_rotate(
        db: AsyncSession,
        *,
        organization_id: uuid.UUID,
        event_id: uuid.UUID,
        participant: Participant,
        expected_version: int,
        idempotency_key: str,
        actor_user_id: uuid.UUID,
    ) -> ConfirmationQRIssueResult:
        prior_receipt = await db.scalar(
            select(RegistrationConfirmationQR).where(
                RegistrationConfirmationQR.organization_id == organization_id,
                RegistrationConfirmationQR.idempotency_key == idempotency_key,
            )
        )
        if prior_receipt is not None:
            if prior_receipt.participant_id != participant.id:
                raise HTTPException(
                    status_code=409,
                    detail={"code": "IDEMPOTENCY_KEY_REUSED"},
                )
            return ConfirmationQRIssueResult(
                credential=prior_receipt,
                old_state=None,
                replayed=True,
            )

        credential = await db.scalar(
            select(RegistrationConfirmationQR).where(
                RegistrationConfirmationQR.participant_id == participant.id,
                RegistrationConfirmationQR.event_id == event_id,
            )
        )
        now = datetime.now(timezone.utc)
        old_state: dict | None = None
        if credential is None:
            if expected_version != 0:
                raise HTTPException(
                    status_code=412,
                    detail={"code": "VERSION_CONFLICT", "current_version": 0},
                )
            credential = RegistrationConfirmationQR(
                organization_id=organization_id,
                event_id=event_id,
                participant_id=participant.id,
                credential_version=1,
                status="ACTIVE",
                idempotency_key=idempotency_key,
                issued_by=actor_user_id,
                issued_at=now,
            )
            db.add(credential)
            await db.flush()
        else:
            if credential.credential_version != expected_version:
                raise HTTPException(
                    status_code=412,
                    detail={
                        "code": "VERSION_CONFLICT",
                        "current_version": credential.credential_version,
                    },
                )
            old_state = {
                "status": credential.status,
                "version": credential.credential_version,
            }
            credential.credential_version += 1
            credential.status = "ACTIVE"
            credential.idempotency_key = idempotency_key
            credential.issued_by = actor_user_id
            credential.rotated_at = now
            credential.revoked_at = None

        token = build_confirmation_token(
            credential.id,
            credential.credential_version,
        )
        participant.qr_code_url = build_confirmation_image_url(token)
        return ConfirmationQRIssueResult(
            credential=credential,
            old_state=old_state,
            replayed=False,
        )
