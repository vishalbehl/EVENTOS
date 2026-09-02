import uuid
from datetime import datetime, timezone
from typing import Optional, List, Dict, Any
from sqlalchemy import select, and_, or_, desc
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.pricing.models import (
    PricingRule, PricingRuleCondition, PricingRuleAction, ServicePricing,
    DiscountRule, TaxRule, CurrencyRate, PricingSimulation, CostFormula,
    MarginPolicy, RevenueForecast
)
from app.modules.commercial.models import Service, StaffRole

class PricingService:
    """
    Pricing calculations, rule evaluations, tax computations, and exchange rate checks.
    """

    @staticmethod
    async def calculate_price(
        db: AsyncSession,
        organization_id: Optional[uuid.UUID],
        service_id: uuid.UUID,
        region: str,
        currency: str,
        quantity: float = 1.0,
        input_data: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """
        Calculate total price of a service factoring base price, rules, discounts, and taxes.
        """
        # Fetch base service pricing
        stmt = select(ServicePricing).where(
            and_(
                ServicePricing.service_id == service_id,
                ServicePricing.region == region
            )
        )
        pricing = (await db.execute(stmt)).scalar_one_or_none()
        if not pricing:
            # Fallback pricing or default
            base_price = 100.0
            tax_code = "GST_18"
            cost_price = 50.0
        else:
            base_price = float(pricing.base_price)
            tax_code = pricing.tax_code
            cost_price = float(pricing.cost_price)

        total_base = base_price * quantity
        
        # Apply pricing rules matching inputs
        rules_output = await PricingService.apply_rules(db, organization_id, total_base, input_data or {})
        adjusted_price = rules_output["price"]
        applied_rules = rules_output["applied"]

        # Calculate tax
        tax_res = await PricingService.calculate_tax(db, tax_code, adjusted_price, region)
        tax_amount = tax_res["tax_amount"]
        final_price = adjusted_price + tax_amount

        # Multi-currency exchange lookup
        exchange_rate = 1.0
        if currency != "USD":
            rate_stmt = select(CurrencyRate).where(
                and_(
                    CurrencyRate.from_currency == "USD",
                    CurrencyRate.to_currency == currency
                )
            )
            rate_obj = (await db.execute(rate_stmt)).scalar_one_or_none()
            if rate_obj:
                exchange_rate = float(rate_obj.exchange_rate)

        return {
            "base_unit_price": base_price,
            "quantity": quantity,
            "total_base_price": total_base,
            "adjusted_price": adjusted_price,
            "applied_rules": applied_rules,
            "tax_rate": tax_res["tax_rate"],
            "tax_amount": tax_amount,
            "final_price_usd": final_price,
            "final_price_converted": final_price * exchange_rate,
            "currency": currency,
            "cost_price": cost_price * quantity
        }

    @staticmethod
    async def apply_rules(
        db: AsyncSession,
        organization_id: Optional[uuid.UUID],
        base_price: float,
        input_data: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Evaluate rules conditions and modify price."""
        stmt = select(PricingRule).where(PricingRule.status == "ACTIVE").order_by(desc(PricingRule.priority))
        rules = list((await db.execute(stmt)).scalars().all())

        if not rules:
            return {"price": base_price, "applied": []}

        # Load the rule graph in two bounded queries instead of querying
        # conditions and actions once per active rule.
        rule_ids = [rule.id for rule in rules]
        condition_rows = (await db.execute(
            select(PricingRuleCondition).where(PricingRuleCondition.rule_id.in_(rule_ids))
        )).scalars().all()
        action_rows = (await db.execute(
            select(PricingRuleAction).where(PricingRuleAction.rule_id.in_(rule_ids))
        )).scalars().all()
        conditions_by_rule: dict[uuid.UUID, list[PricingRuleCondition]] = {}
        actions_by_rule: dict[uuid.UUID, list[PricingRuleAction]] = {}
        for condition in condition_rows:
            conditions_by_rule.setdefault(condition.rule_id, []).append(condition)
        for action in action_rows:
            actions_by_rule.setdefault(action.rule_id, []).append(action)

        current_price = base_price
        applied = []

        for rule in rules:
            # Check conditions
            conditions = conditions_by_rule.get(rule.id, [])

            match = True
            for cond in conditions:
                val = input_data.get(cond.field_name)
                if val is None:
                    match = False
                    break
                
                # Simple parsing of inputs
                try:
                    if cond.operator == ">":
                        match = float(val) > float(cond.value)
                    elif cond.operator == "<":
                        match = float(val) < float(cond.value)
                    elif cond.operator == "=":
                        match = str(val).lower() == str(cond.value).lower()
                    elif cond.operator == "!=":
                        match = str(val).lower() != str(cond.value).lower()
                except ValueError:
                    match = False

                if not match:
                    break

            if match and conditions:
                # Apply action
                actions = actions_by_rule.get(rule.id, [])
                for act in actions:
                    if act.action_type == "PERCENTAGE_DISCOUNT":
                        current_price -= current_price * (float(act.value) / 100.0)
                    elif act.action_type == "PERCENTAGE_MARKUP":
                        current_price += current_price * (float(act.value) / 100.0)
                    elif act.action_type == "FLAT_DISCOUNT":
                        current_price -= float(act.value)
                    elif act.action_type == "FLAT_MARKUP":
                        current_price += float(act.value)
                applied.append(rule.name)

        return {"price": max(0.0, current_price), "applied": applied}

    @staticmethod
    async def apply_discounts(
        db: AsyncSession,
        discount_rule_id: uuid.UUID,
        price: float
    ) -> float:
        """Apply a fixed discount policy."""
        stmt = select(DiscountRule).where(DiscountRule.id == discount_rule_id)
        rule = (await db.execute(stmt)).scalar_one_or_none()
        if not rule:
            return price

        val = float(rule.discount_value)
        if rule.discount_type == "PERCENTAGE":
            discount = price * (val / 100.0)
            if rule.max_discount > 0:
                discount = min(discount, float(rule.max_discount))
            return max(0.0, price - discount)
        elif rule.discount_type == "FLAT":
            return max(0.0, price - val)
        return price

    @staticmethod
    async def calculate_tax(
        db: AsyncSession,
        tax_code: str,
        amount: float,
        region: str
    ) -> Dict[str, Any]:
        """Resolve regional VAT/GST tax rates."""
        stmt = select(TaxRule).where(
            and_(
                TaxRule.tax_code == tax_code,
                TaxRule.is_active == True
            )
        )
        rule = (await db.execute(stmt)).scalar_one_or_none()
        if not rule:
            # 18% default GST fallback
            rate = 18.0
        else:
            rate = float(rule.tax_rate)

        return {
            "tax_rate": rate,
            "tax_amount": amount * (rate / 100.0)
        }


class CostEngineService:
    """Calculates internal procurement, hardware lifecycle depreciation, and staff costs."""

    @staticmethod
    async def calculate_service_cost(
        db: AsyncSession,
        service_id: uuid.UUID
    ) -> float:
        """Fetch cost price from service pricing definitions."""
        stmt = select(ServicePricing.cost_price).where(ServicePricing.service_id == service_id)
        cost = (await db.execute(stmt)).scalar()
        return float(cost or 0.0)

    @staticmethod
    async def calculate_staff_cost(
        db: AsyncSession,
        role_id: uuid.UUID,
        region: str,
        hours: float
    ) -> float:
        """Calculate staff labor costs including base daily/hourly rates and overtime."""
        stmt = select(StaffRole).where(StaffRole.id == role_id)
        role = (await db.execute(stmt)).scalar_one_or_none()
        if not role:
            return hours * 25.0 # fallback $25/hr
        
        # Calculate daily (8hr block) or hourly
        base_rate = float(role.cost_per_day) / 8.0
        if hours > 8:
            overtime_hrs = hours - 8
            overtime_rate = base_rate * 1.5
            cost = (base_rate * 8) + (overtime_hrs * overtime_rate)
        else:
            cost = base_rate * hours
        return cost

    @staticmethod
    async def calculate_equipment_cost(
        db: AsyncSession,
        hardware_id: uuid.UUID,
        days: float
    ) -> float:
        """Calculate equipment depreciation cost over operational days."""
        # Hardware cost calculation removed since inventory module is deleted
        return 0.0

    @staticmethod
    async def calculate_project_cost(
        db: AsyncSession,
        services_list: List[Dict[str, Any]],
        staff_list: List[Dict[str, Any]],
        equipment_list: List[Dict[str, Any]]
    ) -> Dict[str, Any]:
        """Aggregate total service, labor, and hardware depreciation costs."""
        srv_total = 0.0
        for s in services_list:
            cost = await CostEngineService.calculate_service_cost(db, uuid.UUID(str(s["service_id"])))
            srv_total += cost * s.get("quantity", 1)

        staff_total = 0.0
        for st in staff_list:
            cost = await CostEngineService.calculate_staff_cost(
                db, 
                uuid.UUID(str(st["role_id"])), 
                st.get("region", "Global"), 
                st.get("hours", 8)
            )
            staff_total += cost

        equip_total = 0.0
        for eq in equipment_list:
            cost = await CostEngineService.calculate_equipment_cost(
                db,
                uuid.UUID(str(eq["hardware_id"])),
                eq.get("days", 1)
            )
            equip_total += cost

        grand_total = srv_total + staff_total + equip_total
        return {
            "services_cost": srv_total,
            "staff_cost": staff_total,
            "equipment_cost": equip_total,
            "total_cost": grand_total
        }


class MarginEngineService:
    """Enforces profit margins and evaluates discount validation policies."""

    @staticmethod
    def calculate_margin(cost: float, price: float) -> float:
        """Return profit margin percentage."""
        if price <= 0:
            return 0.0
        return ((price - cost) / price) * 100.0

    @staticmethod
    async def validate_margin(
        db: AsyncSession,
        organization_id: Optional[uuid.UUID],
        cost: float,
        price: float,
        discount_amount: float = 0.0
    ) -> Dict[str, Any]:
        """Validate if the projected deal meets the minimum margin policies."""
        stmt = select(MarginPolicy)
        policy = (await db.execute(stmt)).scalar_one_or_none()

        min_margin = 20.0 # 20% fallback minimum margin
        recommended = 40.0
        max_discount = 15.0

        if policy:
            min_margin = float(policy.minimum_margin)
            recommended = float(policy.recommended_margin)
            max_discount = float(policy.maximum_discount)

        net_price = price - discount_amount
        actual_margin = MarginEngineService.calculate_margin(cost, net_price)

        approved = actual_margin >= min_margin
        requires_approval = actual_margin < recommended or discount_amount > (price * (max_discount / 100.0))

        return {
            "cost": cost,
            "net_price": net_price,
            "actual_margin": actual_margin,
            "minimum_margin_required": min_margin,
            "approved": approved,
            "requires_approval": requires_approval
        }


class SimulationService:
    """Pricing simulations and revenue forecasting."""

    @staticmethod
    async def simulate_pricing(
        db: AsyncSession,
        organization_id: Optional[uuid.UUID],
        user_id: uuid.UUID,
        name: str,
        input_data: Dict[str, Any]
    ) -> PricingSimulation:
        """
        Runs a full quotation simulation and persists inputs/outputs.
        """
        # Parse inputs
        attendees = input_data.get("attendees", 100)
        days = input_data.get("days", 1)
        region = input_data.get("region", "India")
        services = input_data.get("services", [])
        staff = input_data.get("staff", [])
        equipment = input_data.get("equipment", [])

        # 1. Resolve pricing details
        total_price = 0.0
        calculated_services = []
        for s in services:
            res = await PricingService.calculate_price(
                db=db,
                organization_id=organization_id,
                service_id=uuid.UUID(str(s["service_id"])),
                region=region,
                currency="USD",
                quantity=s.get("quantity", 1),
                input_data=input_data
            )
            total_price += res["final_price_usd"]
            calculated_services.append(res)

        # 2. Resolve costs
        costs = await CostEngineService.calculate_project_cost(db, services, staff, equipment)
        total_cost = costs["total_cost"]

        # 3. Margin check
        margin_res = await MarginEngineService.validate_margin(db, organization_id, total_cost, total_price)

        output_data = {
            "total_price": total_price,
            "total_cost": total_cost,
            "margin_status": margin_res,
            "breakdown": costs,
            "service_calculations": calculated_services
        }

        sim = PricingSimulation(
            id=uuid.uuid4(),
            organization_id=organization_id,
            user_id=user_id,
            name=name,
            input_data=input_data,
            output_data=output_data,
            created_at=datetime.now(timezone.utc)
        )
        db.add(sim)
        await db.flush()
        return sim

    @staticmethod
    async def generate_forecast(
        db: AsyncSession,
        organization_id: uuid.UUID,
        month: datetime,
        forecast_amount: float,
        actual_amount: float = 0.0
    ) -> RevenueForecast:
        """Create a monthly revenue forecast projection entry."""
        forecast = RevenueForecast(
            id=uuid.uuid4(),
            organization_id=organization_id,
            month=month,
            forecast_amount=forecast_amount,
            actual_amount=actual_amount,
            created_at=datetime.now(timezone.utc)
        )
        db.add(forecast)
        await db.flush()
        return forecast
