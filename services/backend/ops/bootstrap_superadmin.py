"""Create the first production super administrator with TOTP already enabled."""

from __future__ import annotations

import asyncio
import json
import os
import uuid
from datetime import datetime, timezone

import boto3
from sqlalchemy import select

import app.models  # noqa: F401 - register all ORM mappings
from app.core.encryption import encrypt
from app.database import AsyncSessionLocal
from app.modules.audit.models.audit_log import AuditLog
from app.modules.identity.models.identity_domain_tables import MfaDevice
from app.modules.identity.models.user import User
from app.modules.identity.services.auth_service import hash_password
from app.modules.identity.services.mfa_service import build_totp_uri, generate_totp_secret
from app.modules.platform.models.organization import Organization
from app.modules.rbac.models.organization_member import OrganizationMember


def required(name: str) -> str:
    value = os.environ.get(name, "").strip()
    if not value:
        raise RuntimeError(f"Required environment variable {name} is missing")
    return value


async def bootstrap() -> tuple[str, str]:
    email = required("BOOTSTRAP_SUPERADMIN_EMAIL").lower()
    password = required("BOOTSTRAP_SUPERADMIN_PASSWORD")
    if len(password) < 16:
        raise RuntimeError("Bootstrap super-admin password must contain at least 16 characters")

    async with AsyncSessionLocal() as db:
        existing = await db.scalar(select(User).where(User.email == email))
        if existing is not None:
            raise RuntimeError("A user with the bootstrap email already exists; refusing to rotate it")

        organization = await db.scalar(
            select(Organization).where(Organization.slug == "eventxos")
        )
        if organization is None:
            organization = Organization(
                id=uuid.uuid4(),
                name="Eventxos",
                slug="eventxos",
                is_platform_org=True,
                is_active=True,
            )
            db.add(organization)
            await db.flush()

        user = User(
            id=uuid.uuid4(),
            organization_id=organization.id,
            email=email,
            password_hash=hash_password(password),
            first_name="Platform",
            last_name="Administrator",
            role="super_admin",
            platform_role="SUPER_ADMIN",
            is_platform_admin=True,
            is_active=True,
            is_2fa_enabled=True,
        )
        db.add(user)
        await db.flush()

        totp_secret = generate_totp_secret()
        db.add(
            MfaDevice(
                user_id=user.id,
                device_type="totp",
                encrypted_secret=encrypt(totp_secret),
                is_active=True,
            )
        )
        db.add(
            OrganizationMember(
                organization_id=organization.id,
                user_id=user.id,
                org_role="owner",
                is_active=True,
                accepted_at=datetime.now(timezone.utc),
            )
        )
        db.add(
            AuditLog(
                organization_id=organization.id,
                actor_user_id=user.id,
                resource_type="identity_bootstrap",
                resource_id=user.id,
                action_type="SUPERADMIN_BOOTSTRAPPED",
                actor_role="SYSTEM_BOOTSTRAP",
                new_state={"email": email, "mfa_enabled": True},
                change_diff={"source": "ECS_ONE_TIME_TASK"},
                is_sensitive=True,
            )
        )
        await db.commit()
        return email, build_totp_uri(totp_secret, email)


def main() -> None:
    email, uri = asyncio.run(bootstrap())
    client = boto3.client("secretsmanager", region_name=required("AWS_REGION"))
    client.put_secret_value(
        SecretId=required("IDENTITY_BOOTSTRAP_SECRET_ARN"),
        SecretString=json.dumps(
            {
                "BOOTSTRAP_SUPERADMIN_EMAIL": email,
                "MFA_ENROLLMENT_URI": uri,
                "STATUS": "COMPLETED_REMOVE_AFTER_ENROLLMENT",
            }
        ),
    )
    print("Super administrator created with MFA enabled; retrieve the enrollment URI from Secrets Manager.")


if __name__ == "__main__":
    main()
