import psycopg2

conn = psycopg2.connect(
    host="localhost", port=5432,
    user="postgres", password="847425", dbname="postgres"
)
conn.autocommit = True
cur = conn.cursor()
cur.execute("SELECT 1 FROM pg_database WHERE datname='eventos_db_test'")
if not cur.fetchone():
    cur.execute("CREATE DATABASE eventos_db_test OWNER postgres")
    print("Created: eventos_db_test")
else:
    print("Already exists: eventos_db_test")
conn.close()
