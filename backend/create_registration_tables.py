# backend/create_registration_tables.py
import sys
from app.database import engine, Base
from app.models.participant import Participant
from app.models.check_in import CheckIn
from app.models.print_template import PrintTemplate
from app.models.ticket_type import TicketType

def create_tables():
    print("Initializing database tables for Registration Suite...")
    try:
        # Create tables using the sync engine
        Base.metadata.create_all(
            bind=engine, 
            tables=[
                Participant.__table__, 
                CheckIn.__table__, 
                PrintTemplate.__table__, 
                TicketType.__table__
            ]
        )
        print("Success: Registration tables created successfully in PostgreSQL.")
    except Exception as e:
        print(f"Error: Failed to create tables: {e}")
        sys.exit(1)

if __name__ == "__main__":
    create_tables()
