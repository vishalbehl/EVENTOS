import psycopg2

conn = psycopg2.connect("postgresql://postgres:847425@localhost:5432/eventos_db")
cur = conn.cursor()

# Get some events and speakers
cur.execute("""
    SELECT s.event_id, s.upload_token, s.first_name, s.last_name, s.email, e.name
    FROM speakers.speakers s
    JOIN rbac.events e ON s.event_id = e.id
    LIMIT 10;
""")
rows = cur.fetchall()
print("SPEAKER LINKS:")
for row in rows:
    print(f"Speaker: {row[2]} {row[3]} ({row[4]}) in event '{row[5]}'")
    print(f"URL: http://localhost:3001/{row[0]}/{row[1]}")
    print()

cur.close()
conn.close()
