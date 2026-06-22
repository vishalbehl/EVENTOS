import uuid
from datetime import datetime
from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field, ConfigDict

# Pricing Rule Conditions
class PricingRuleConditionCreate(BaseModel):
    field_name: str = Field(min_length=1, max_length=100)
    operator: str = Field(min_length=1, max_length=20)
    value: str = Field(min_length=1, max_length=255)
    logical_operator: str = "AND"

class PricingRuleConditionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    rule_id: uuid.UUID
    field_name: str
    operator: str
    value: str
    logical_operator: str

# Pricing Rule Actions
class PricingRuleActionCreate(BaseModel):
    action_type: str = Field(min_length=1, max_length=50)
    value: float = Field(ge=0.0)

class PricingRuleActionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    rule_id: uuid.UUID
    action_type: str
    value: float

# Pricing Rule
class PricingRuleCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    code: str = Field(min_length=1, max_length=50)
    description: Optional[str] = None
    status: str = "ACTIVE"
    effective_from: datetime
    effective_to: datetime
    priority: int = 0
    conditions: List[PricingRuleConditionCreate]
    actions: List[PricingRuleActionCreate]

class PricingRuleOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    organization_id: Optional[uuid.UUID]
    name: str
    code: str
    description: Optional[str]
    status: str
    effective_from: datetime
    effective_to: datetime
    priority: int

# Service Pricing Definition
class ServicePricingCreate(BaseModel):
    service_id: uuid.UUID
    region: str = Field(min_length=1, max_length=50)
    currency: str = Field(default="USD", min_length=3, max_length=3)
    base_price: float = Field(ge=0.0)
    minimum_price: float = Field(ge=0.0)
    maximum_price: float = Field(ge=0.0)
    cost_price: float = Field(ge=0.0)
    margin_percentage: float = Field(default=0.0, ge=0.0, le=100.0)
    tax_code: str = Field(min_length=1, max_length=50)
    effective_from: datetime
    effective_to: datetime

class ServicePricingOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    service_id: uuid.UUID
    region: str
    currency: str
    base_price: float
    minimum_price: float
    maximum_price: float
    cost_price: float
    margin_percentage: float
    tax_code: str
    effective_from: datetime
    effective_to: datetime

# Discount Rule
class DiscountRuleCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    discount_type: str = Field(min_length=1, max_length=50) # PERCENTAGE, FLAT
    discount_value: float = Field(ge=0.0)
    max_discount: float = Field(default=0.0, ge=0.0)
    approval_required: bool = False

class DiscountRuleOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    name: str
    discount_type: str
    discount_value: float
    max_discount: float
    approval_required: bool

# Tax Rule
class TaxRuleCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    country: str = Field(min_length=1, max_length=100)
    tax_rate: float = Field(ge=0.0, le=100.0)
    tax_code: str = Field(min_length=1, max_length=50)
    is_active: bool = True

class TaxRuleOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    name: str
    country: str
    tax_rate: float
    tax_code: str
    is_active: bool

# Currency Rate
class CurrencyRateCreate(BaseModel):
    from_currency: str = Field(min_length=3, max_length=3)
    to_currency: str = Field(min_length=3, max_length=3)
    exchange_rate: float = Field(gt=0.0)

class CurrencyRateOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    from_currency: str
    to_currency: str
    exchange_rate: float
    updated_at: datetime

# Pricing Simulation
class PricingSimulationCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    input_data: Dict[str, Any]

class PricingSimulationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    organization_id: Optional[uuid.UUID]
    user_id: uuid.UUID
    name: str
    input_data: Dict[str, Any]
    output_data: Dict[str, Any]
    created_at: datetime

# Cost Formula
class CostFormulaCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    expression: str = Field(min_length=1)
    description: Optional[str] = None

class CostFormulaOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    name: str
    expression: str
    description: Optional[str]

# Margin Policy
class MarginPolicyCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    minimum_margin: float = Field(ge=0.0, le=100.0)
    recommended_margin: float = Field(ge=0.0, le=100.0)
    maximum_discount: float = Field(ge=0.0, le=100.0)

class MarginPolicyOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    name: str
    minimum_margin: float
    recommended_margin: float
    maximum_discount: float

# Revenue Forecast
class RevenueForecastCreate(BaseModel):
    month: datetime
    forecast_amount: float = Field(default=0.0, ge=0.0)
    actual_amount: float = Field(default=0.0, ge=0.0)

class RevenueForecastOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    organization_id: uuid.UUID
    month: datetime
    forecast_amount: float
    actual_amount: float
    created_at: datetime

# On-the-fly computation payloads
class PriceCalculateRequest(BaseModel):
    service_id: uuid.UUID
    region: str = Field(default="India")
    currency: str = Field(default="USD")
    quantity: float = 1.0
    input_data: Optional[Dict[str, Any]] = None

class PriceCalculateResponse(BaseModel):
    base_unit_price: float
    quantity: float
    total_base_price: float
    adjusted_price: float
    applied_rules: List[str]
    tax_rate: float
    tax_amount: float
    final_price_usd: float
    final_price_converted: float
    currency: str
    cost_price: float
