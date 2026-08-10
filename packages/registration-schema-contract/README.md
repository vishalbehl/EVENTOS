# Registration schema contract

This package is the shared registration execution schema contract.

Use it to verify that Cloud backend, Venue Server, Registration Server, shared
Registration PostgreSQL, and SQLite fallback generation all agree on the tables
and columns required by the Registration Software.

## Files

- `version.json` - schema contract metadata.
- `tables.json` - required table and column manifest.

Extra columns are allowed in broad services like Cloud backend and Venue Server.
Required contract tables and columns are not optional.

## Verification

Use:

```powershell
python scripts/verify_registration_schema_contract.py --database-url "postgresql+psycopg2://..."
```

The verifier exits non-zero if any required table or column is missing.
