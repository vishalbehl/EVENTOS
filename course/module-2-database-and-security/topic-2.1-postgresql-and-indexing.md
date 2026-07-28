# Module 2 - Topic 2.1: PostgreSQL 16 Data Modeling, Indexing & JSONB Optimization

## 1. Introduction & Learning Objectives
Welcome to **Topic 2.1**. In this chapter, you will master enterprise relational data modeling in PostgreSQL 16, indexing strategies, query execution analysis (`EXPLAIN ANALYZE`), and JSONB metadata optimization.

### Learning Outcomes:
- Design 3NF normalized tables supporting complex multi-tenant event hierarchies.
- Choose between B-Tree, Composite, and GIN indexes.
- Optimize high-throughput queries using execution plan diagnostics.

---

## 2. Relational Schema Design for EventOS

### 2.1 Database Schema Hierarchy
```
tenants (id, name, slug)
  └── events (id, tenant_id, title, start_date)
        ├── sessions (id, event_id, room_id, title)
        ├── speakers (id, event_id, name, bio)
        └── tickets (id, event_id, user_id, status)
```

### 2.2 Table DDL Example (PostgreSQL DDL)
```sql
CREATE TABLE events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id VARCHAR(50) NOT NULL,
    title VARCHAR(255) NOT NULL,
    slug VARCHAR(100) NOT NULL,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

-- Composite Index for Fast Multi-Tenant Query Filtering
CREATE INDEX idx_events_tenant_slug ON events (tenant_id, slug);

-- GIN Index for Fast JSONB Metadata Searches
CREATE INDEX idx_events_metadata ON events USING GIN (metadata);
```

---

## 3. Query Optimization & `EXPLAIN ANALYZE`

### 3.1 Analyzing Query Execution Plans
To diagnose slow queries, inspect execution plans using PostgreSQL `EXPLAIN ANALYZE`:

```sql
EXPLAIN ANALYZE 
SELECT * FROM events 
WHERE tenant_id = 'org_techconf' AND slug = 'annual-2026';
```

Output inspection:
- **Index Scan**: Fast (O(log N)) execution using `idx_events_tenant_slug`.
- **Seq Scan**: Slow (O(N)) sequential table sweep indicating a missing index.

---

## 4. Practical Exercise & Self-Assessment

### Hands-On Exercise:
1. Write a SQL query using JSONB operators (`metadata->>'category' = 'Keynote'`) against the `events` table.
2. Add a `GIN` index on `metadata` and verify execution speed improvements using `EXPLAIN ANALYZE`.

---

## 5. Chapter Summary & Next Steps
You have mastered PostgreSQL schema design, composite indexing, and JSONB optimization. Next, move to **[Topic 2.2: Async SQLAlchemy & Alembic Migrations](./topic-2.2-sqlalchemy-and-alembic.md)**.
