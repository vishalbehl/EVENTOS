# Detailed Walkthrough - Prevent Gateway Columns in New DB Creation

This document details the modifications made to the historical Alembic migrations to ensure that the payment gateway columns (`stripe_product_id` and `razorpay_plan_id`) are never added back when a new database is generated from scratch.

## Changes Made

### 1. Initial Table Definition Migration
- **File modified**: [20260610_0536_1b39bb2f0e3d_enterprise_schema_v2.py](file:///d:/DEV/conf-platform/services/backend/alembic/versions/20260610_0536_1b39bb2f0e3d_enterprise_schema_v2.py#L181)
- **Detail**:
  - Removed the `sa.Column('stripe_product_id', sa.String(length=255), nullable=True),` statement from the `op.create_table('subscription_plans', ...)` invocation in `upgrade()`.
  - The `stripe_product_id` column inside `op.create_table('addons', ...)` was left intact as requested (since it only targets plans-related tables).

### 2. Subsequent Schema Migration
- **File modified**: [20260613_0201_922d300bd1ba_subscription_plans_v2.py](file:///d:/DEV/conf-platform/services/backend/alembic/versions/20260613_0201_922d300bd1ba_subscription_plans_v2.py#L37)
- **Detail**:
  - Removed `op.add_column('subscription_plans', sa.Column('razorpay_plan_id', sa.String(100), nullable=True), schema='billing')` from the `upgrade()` function.
  - Removed `'razorpay_plan_id'` from the `for col in [...]` loop list in the `downgrade()` function to prevent trying to drop a non-existent column.

---

## Verification Results

### Offline Migration Dry-Run
- We generated the static SQL migrations output offline to inspect the DDL for the `billing.subscription_plans` and `billing.addons` tables:
  ```bash
  .venv\Scripts\python -m alembic upgrade 1b39bb2f0e3d --sql
  ```
- **Results**:
  - **`billing.addons` table definition**: Still includes the `stripe_product_id` column as expected:
    ```sql
    CREATE TABLE billing.addons (
        id UUID NOT NULL, 
        name VARCHAR(255) NOT NULL, 
        description TEXT, 
        monthly_price NUMERIC(10, 2) NOT NULL, 
        yearly_price NUMERIC(10, 2) NOT NULL, 
        stripe_product_id VARCHAR(255), 
        created_at TIMESTAMP WITH TIME ZONE NOT NULL, 
        PRIMARY KEY (id)
    );
    ```
  - **`billing.subscription_plans` table definition**: Created cleanly *without* the `stripe_product_id` or `razorpay_plan_id` columns:
    ```sql
    CREATE TABLE billing.subscription_plans (
        id UUID NOT NULL, 
        name VARCHAR(100) NOT NULL, 
        description TEXT, 
        max_events INTEGER NOT NULL, 
        max_users INTEGER NOT NULL, 
        max_registrations INTEGER NOT NULL, 
        max_rooms INTEGER NOT NULL, 
        storage_quota_mb BIGINT NOT NULL, 
        is_active BOOLEAN NOT NULL, 
        created_at TIMESTAMP WITH TIME ZONE NOT NULL, 
        updated_at TIMESTAMP WITH TIME ZONE NOT NULL, 
        PRIMARY KEY (id), 
        UNIQUE (name)
    );
    ```
