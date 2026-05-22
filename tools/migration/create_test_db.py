import psycopg2

conn = psycopg2.connect(
    host="localhost", port=5432,
    user="postgres", password="847425", dbname="postgres"
)
conn.autocommit = True
cur = conn.cursor()
cur.execute("SELECT 1 FROM pg_database WHERE datname='conf_platform_test'")
if not cur.fetchone():
    cur.execute("CREATE DATABASE conf_platform_test OWNER postgres")
    print("Created: conf_platform_test")
else:
    print("Already exists: conf_platform_test")
conn.close()
