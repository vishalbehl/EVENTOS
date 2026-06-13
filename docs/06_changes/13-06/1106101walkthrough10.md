# Detailed Walkthrough - Feature Matrix Clean Up & Gateway IDs Removal

This document outlines the modifications made to the Eventos platform to resolve duplicate feature categories in the super-admin plans comparison matrix and to remove Stripe/Razorpay integration IDs from the Plans UI.

## Changes Made

### 1. Backend Feature Catalog Seeding Clean Up
- **File modified**: [init_service.py](file:///d:/DEV/conf-platform/services/backend/app/services/init_service.py)
- **Detail**:
  - Imported `delete` from `sqlalchemy` to safely remove records.
  - Imported `AddonFeature` and `OrganizationFeature` from `app.modules.billing.models.subscription`.
  - Added a cleanup loop at the start of database seeding:
    ```python
    seed_keys = {f["key"] for f in features}
    obsolete_stmt = select(FeatureCatalog).where(FeatureCatalog.key.not_in(seed_keys))
    obsolete_feats = (await db.execute(obsolete_stmt)).scalars().all()
    for ob_feat in obsolete_feats:
        logger.info(f"Deleting obsolete feature from catalog: {ob_feat.key}")
        await db.execute(delete(PlanFeature).where(PlanFeature.feature_id == ob_feat.id))
        await db.execute(delete(OrganizationFeature).where(OrganizationFeature.feature_id == ob_feat.id))
        await db.execute(delete(AddonFeature).where(AddonFeature.feature_id == ob_feat.id))
        await db.delete(ob_feat)
    await db.flush()
    ```
  - This ensures any legacy active feature categories like `"Registration"`, `"Speaker Management"`, `"Enterprise"`, `"Add-ons"`, etc., that were left over in the database from previous schema versions are safely cleaned up.

### 2. Front-End Payment Gateway UI Removal
- **File modified**: [page.tsx](file:///d:/DEV/conf-platform/apps/cloud/command-center/app/super-admin/commercial/plans/page.tsx)
- **Detail**:
  - Removed the entire `"Gateway Integration IDs"` section containing inputs for `Stripe Product ID`, `Stripe Price ID`, and `Razorpay Plan ID` from the limits edit panel.
  - Removed the `Stripe Product ID`, `Stripe Price ID`, and `Razorpay Plan ID` detail display rows from the plan's `"Pricing"` info tab.
  - Keeps the backend model integration fields intact so no database columns are dropped or API payloads broken, while ensuring the user's interface remains strictly focused on plans limits, allocations, and core pricing.

## Verification Results

### Database Verification
Running the seeding and status check script [run_seeding.py](file:///d:/DEV/conf-platform/services/backend/scratch/run_seeding.py) outputs:
```
Active features in DB: 67
Grouped categories count: 9
- Category: Support has 6 features
- Category: Platform Limits has 9 features
- Category: Registration has 9 features
- Category: Speaker Management has 8 features
- Category: Badge Certificate has 7 features
- Category: Communications has 8 features
- Category: Branding has 6 features
- Category: Mobile Integrations has 5 features
- Category: Venue Operations has 9 features
```
This confirms:
- Obsolete feature entries (like `CORE_REGISTRATION`, `CORE_SPEAKER_MGMT`, etc.) have been completely removed.
- Active categories are exactly the 9 core categories from our seeded features list, matching the Eventos apps.
- All duplicates are gone.
