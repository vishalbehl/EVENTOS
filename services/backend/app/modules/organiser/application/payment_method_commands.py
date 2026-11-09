"""Tenant-scoped payment-method lifecycle commands.

Only provider references and display-safe card metadata are stored here. Raw
payment credentials never enter this command surface.
"""

from __future__ import annotations

from datetime import datetime, timezone

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.idempotency_service import begin_idempotent, complete_idempotent, replay_response
from app.modules.audit.models.audit_log import AuditLog
from app.modules.billing.models.billing_domain_tables import PaymentMethod
from app.modules.billing.models.cloud_commercial import CommercialAccount, CommercialContract


class OrganizerPaymentMethodCommandService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def set_default(self, *, organization_id, payment_method_id, actor, if_match: int, idempotency_key: str) -> dict:
        try:
            idem = await begin_idempotent(
                self.db, organization_id=organization_id, actor_id=actor.id,
                operation="organiser.billing.payment_method.default", key=idempotency_key,
                payload={"payment_method_id": str(payment_method_id), "if_match": if_match},
            )
            replay = replay_response(idem)
            if replay is not None:
                await self.db.commit()
                return replay[1]
            rows = list((await self.db.scalars(select(PaymentMethod).where(
                PaymentMethod.organization_id == organization_id,
                PaymentMethod.retired_at.is_(None),
            ).order_by(PaymentMethod.id).with_for_update())).all())
            target = next((row for row in rows if row.id == payment_method_id), None)
            if target is None:
                raise HTTPException(status_code=404, detail={"code": "PAYMENT_METHOD_NOT_FOUND"})
            if target.version != if_match:
                raise HTTPException(status_code=status.HTTP_412_PRECONDITION_FAILED, detail={
                    "code": "VERSION_CONFLICT", "current_version": target.version,
                })
            for row in rows:
                next_default = row.id == target.id
                if row.is_default != next_default:
                    row.is_default = next_default
                    row.version = int(row.version or 0) + 1
                    row.updated_at = datetime.now(timezone.utc)
            self.db.add(AuditLog(
                organization_id=organization_id, actor_user_id=actor.id, actor_role=actor.role,
                resource_type="payment_method", resource_id=target.id,
                action_type="ORGANIZATION_PAYMENT_METHOD_DEFAULT_CHANGED",
                new_state={"provider": target.provider, "card_last4": target.card_last4},
                is_sensitive=True,
            ))
            response = self._response(target)
            await complete_idempotent(self.db, idem, response_status=200, response_body=response, resource_id=target.id)
            await self.db.commit()
            return response
        except Exception:
            await self.db.rollback()
            raise

    async def retire(self, *, organization_id, payment_method_id, actor, if_match: int, idempotency_key: str, reason: str) -> dict:
        try:
            idem = await begin_idempotent(
                self.db, organization_id=organization_id, actor_id=actor.id,
                operation="organiser.billing.payment_method.retire", key=idempotency_key,
                payload={"payment_method_id": str(payment_method_id), "if_match": if_match, "reason": reason},
            )
            replay = replay_response(idem)
            if replay is not None:
                await self.db.commit()
                return replay[1]
            rows = list((await self.db.scalars(select(PaymentMethod).where(
                PaymentMethod.organization_id == organization_id,
                PaymentMethod.retired_at.is_(None),
            ).order_by(PaymentMethod.id).with_for_update())).all())
            target = next((row for row in rows if row.id == payment_method_id), None)
            if target is None:
                raise HTTPException(status_code=404, detail={"code": "PAYMENT_METHOD_NOT_FOUND"})
            if target.version != if_match:
                raise HTTPException(status_code=status.HTTP_412_PRECONDITION_FAILED, detail={
                    "code": "VERSION_CONFLICT", "current_version": target.version,
                })
            replacements = [row for row in rows if row.id != target.id]
            account_id = await self.db.scalar(select(CommercialAccount.id).where(
                CommercialAccount.owner_organization_id == organization_id,
            ))
            auto_renew = False
            if account_id is not None:
                auto_renew = bool(await self.db.scalar(select(CommercialContract.id).where(
                    CommercialContract.commercial_account_id == account_id,
                    CommercialContract.status == "ACTIVE",
                    CommercialContract.auto_renew.is_(True),
                    CommercialContract.cancel_at_period_end.is_(False),
                ).limit(1).with_for_update()))
            if auto_renew and not replacements:
                raise HTTPException(status_code=409, detail={
                    "code": "PAYMENT_METHOD_REPLACEMENT_REQUIRED",
                    "message": "Add another payment method before removing the only method for an auto-renewing contract.",
                })
            old_state = self._response(target)
            target.is_default = False
            target.retired_at = datetime.now(timezone.utc)
            target.updated_at = target.retired_at
            target.version = int(target.version or 0) + 1
            if replacements and not any(row.is_default for row in replacements):
                replacement = max(replacements, key=lambda row: row.created_at)
                replacement.is_default = True
                replacement.version = int(replacement.version or 0) + 1
                replacement.updated_at = datetime.now(timezone.utc)
            self.db.add(AuditLog(
                organization_id=organization_id, actor_user_id=actor.id, actor_role=actor.role,
                resource_type="payment_method", resource_id=target.id,
                action_type="ORGANIZATION_PAYMENT_METHOD_RETIRED", old_state=old_state,
                new_state={"reason": reason, "retired_at": target.retired_at.isoformat()},
                is_sensitive=True,
            ))
            response = {"id": str(target.id), "retired": True, "version": target.version}
            await complete_idempotent(self.db, idem, response_status=200, response_body=response, resource_id=target.id)
            await self.db.commit()
            return response
        except Exception:
            await self.db.rollback()
            raise

    @staticmethod
    def _response(row: PaymentMethod) -> dict:
        return {
            "id": str(row.id), "provider": row.provider, "card_brand": row.card_brand,
            "card_last4": row.card_last4, "expires_month": row.expires_month,
            "expires_year": row.expires_year, "is_default": row.is_default,
            "version": row.version,
        }
