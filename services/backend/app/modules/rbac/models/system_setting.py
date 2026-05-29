from sqlalchemy import String, Text
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base

class SystemSetting(Base):
    """
    Global system settings that affect the entire application ecosystem.
    """
    __tablename__ = "system_settings"

    key: Mapped[str] = mapped_column(String(100), primary_key=True)
    value: Mapped[str] = mapped_column(Text, nullable=False)

    def __repr__(self) -> str:
        return f"<SystemSetting key={self.key} value={self.value}>"
