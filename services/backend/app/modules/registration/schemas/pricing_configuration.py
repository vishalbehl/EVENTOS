"""Bounded contracts for a coherent, versioned ticket-pricing configuration."""
from datetime import datetime
from decimal import Decimal, InvalidOperation
from typing import Annotated
import uuid

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator
from app.modules.rbac.schemas.event import EventResponse

TierName = Annotated[str, Field(min_length=1, max_length=100)]


class PricingRole(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: uuid.UUID
    name: str
    category: str
    role_code: str
    is_active: bool
    is_default: bool
    sort_order: int
    version: int
    event_version: int


class PricingConfigurationResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")
    event: EventResponse
    version: int
    tiers: list[str]
    pricingData: dict[str, float]
    tierSchedules: dict[str, dict[str, str | None]]
    tierCutoffs: dict[str, str | None]
    roles: list[PricingRole]


class TierSchedule(BaseModel):
    model_config = ConfigDict(extra="forbid")
    available_from: datetime | None = None
    available_until: datetime | None = None

    @model_validator(mode="after")
    def valid_window(self):
        for value in (self.available_from, self.available_until):
            if value is not None and value.utcoffset() is None:
                raise ValueError("Tier timestamps require an explicit timezone.")
        if self.available_from and self.available_until and self.available_from >= self.available_until:
            raise ValueError("Tier start must precede cutoff.")
        return self


class PricingConfigurationUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    tiers: list[TierName] = Field(min_length=1, max_length=100)
    pricingData: dict[str, Decimal | None] = Field(max_length=10000)
    tierSchedules: dict[TierName, TierSchedule] = Field(default_factory=dict, max_length=100)
    tierCutoffs: dict[TierName, datetime | None] = Field(default_factory=dict, max_length=100)

    @field_validator("pricingData", mode="before")
    @classmethod
    def money(cls, value):
        if not isinstance(value, dict) or len(value) > 10000:
            raise ValueError("Pricing matrix exceeds bounds.")
        for key, amount in value.items():
            if not isinstance(key, str) or not 1 <= len(key) <= 201:
                raise ValueError("Invalid pricing key.")
            if amount is None:
                continue
            if isinstance(amount, bool):
                raise ValueError("Invalid ticket price.")
            try:
                price = Decimal(str(amount))
            except (InvalidOperation, ValueError) as exc:
                raise ValueError("Invalid ticket price.") from exc
            if not price.is_finite() or price < 0 or price > Decimal("1000000000"):
                raise ValueError("Ticket price is outside allowed bounds.")
        return value

    @model_validator(mode="after")
    def configured_tiers(self):
        cleaned = [tier.strip() for tier in self.tiers]
        if any(not tier for tier in cleaned) or len(set(cleaned)) != len(cleaned):
            raise ValueError("Tier names must be nonempty and unique.")
        self.tiers = cleaned
        if (set(self.tierSchedules) | set(self.tierCutoffs)) - set(cleaned):
            raise ValueError("Schedules must belong to configured tiers.")
        for value in self.tierCutoffs.values():
            if value is not None and value.utcoffset() is None:
                raise ValueError("Cutoffs require an explicit timezone.")
        return self
