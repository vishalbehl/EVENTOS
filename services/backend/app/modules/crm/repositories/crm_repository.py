from app.modules.crm.models.core import Account, Contact, Lead
from app.modules.crm.repositories.base_repository import BaseRepository

class AccountRepository(BaseRepository[Account]):
    def __init__(self, session, organization_id):
        super().__init__(Account, session, organization_id)

class ContactRepository(BaseRepository[Contact]):
    def __init__(self, session, organization_id):
        super().__init__(Contact, session, organization_id)

class LeadRepository(BaseRepository[Lead]):
    def __init__(self, session, organization_id):
        super().__init__(Lead, session, organization_id)
