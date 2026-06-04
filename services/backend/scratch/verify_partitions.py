import psycopg2
conn = psycopg2.connect(dbname='conf_platform', user='postgres', password='847425', host='localhost', port=5432)
cur = conn.cursor()
cur.execute("SELECT schemaname, tablename FROM pg_tables WHERE tablename LIKE 'audit_logs%' ORDER BY tablename")
rows = cur.fetchall()
print(f"audit_logs partitions ({len(rows)} total):")
for r in rows:
    print(f"  {r[0]}.{r[1]}")

cur.execute("SELECT schemaname, tablename FROM pg_tables WHERE tablename LIKE 'api_request_logs%' ORDER BY tablename")
rows2 = cur.fetchall()
print(f"\napi_request_logs partitions ({len(rows2)} total):")
for r in rows2:
    print(f"  {r[0]}.{r[1]}")
conn.close()
