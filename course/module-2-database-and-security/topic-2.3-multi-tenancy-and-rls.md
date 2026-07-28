# Module 2 - Topic 2.3: Multi-Tenancy Architecture & PostgreSQL Row-Level Security (RLS)

## 1. Introduction & Learning Objectives
Welcome to **Topic 2.3**. In this chapter, you will master enterprise multi-tenant database isolation using PostgreSQL **Row-Level Security (RLS)** and automated RLS auditing tools ([services/backend/tenant-rls-audit.json](file:///d:/DEV/conf-platform/services/backend/tenant-rls-audit.json)).

### Learning Outcomes:
- Understand multi-tenant isolation patterns (Shared DB vs Schema per Tenant).
- Write PostgreSQL `ROW LEVEL SECURITY` policies.
- Automatically set DB session context variables in FastAPI connection handlers.

---

## 2. Multi-Tenancy Patterns & PostgreSQL RLS

### 2.1 Why Row-Level Security (RLS)?
In a shared multi-tenant database, relying solely on application-level `WHERE tenant_id = '...'` filters is prone to developer error. PostgreSQL RLS enforces security directly at the database engine level.

```
┌────────────────────────────────────────────────────────┐
│               PostgreSQL Database Engine               │
│                                                        │
│  Query: SELECT * FROM events                           │
│  RLS Policy: tenant_id = current_setting('app.tenant') │
│                                                        │
│  Result: Filters rows automatically before returning   │
└────────────────────────────────────────────────────────┘
```

---

## 3. SQL RLS Policy Implementation

```sql
-- 1. Enable RLS on events table
ALTER TABLE events ENABLE ROW LEVEL SECURITY;

-- 2. Create Security Policy matching active session variable
CREATE POLICY tenant_isolation_policy ON events
    FOR ALL
    USING (tenant_id = current_setting('app.current_tenant_id', true));
```

### 3.1 Injecting Tenant Context in FastAPI DB Connections
In FastAPI middleware ([services/backend/app/middleware/tenant.py](file:///d:/DEV/conf-platform/services/backend/app/middleware/tenant.py)):

```python
async def set_db_tenant_context(db: AsyncSession, tenant_id: str):
    # Sets session variable scoped strictly to current transaction
    await db.execute(text(f"SET LOCAL app.current_tenant_id = '{tenant_id}'"))
```

---

## 4. Practical Exercise & Self-Assessment

### Hands-On Exercise:
1. Connect to PostgreSQL using `psql`.
2. Run `SET LOCAL app.current_tenant_id = 'org_alpha';`
3. Execute `SELECT * FROM events;` and observe that only rows belonging to `org_alpha` are returned.

---

## 5. Chapter Summary & Next Steps
You have mastered PostgreSQL Row-Level Security and tenant context isolation. Next, move to **[Topic 2.4: Cryptography & Data Security](./topic-2.4-cryptography-and-data-security.md)**.
