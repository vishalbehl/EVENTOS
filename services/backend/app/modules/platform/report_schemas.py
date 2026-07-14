from datetime import datetime
from enum import Enum
from uuid import UUID

from pydantic import BaseModel, Field


class CommercialReportType(str, Enum):
    HARDWARE_CATALOG = "hardware_catalog"
    STAFF_CATALOG = "staff_catalog"
    PRICING_SIMULATIONS = "pricing_simulations"
    PRICING_RULES = "pricing_rules"


class CommercialReportFormat(str, Enum):
    XLSX = "xlsx"
    CSV = "csv"
    PDF = "pdf"


REPORT_FORMATS: dict[CommercialReportType, CommercialReportFormat] = {
    CommercialReportType.HARDWARE_CATALOG: CommercialReportFormat.XLSX,
    CommercialReportType.STAFF_CATALOG: CommercialReportFormat.XLSX,
    CommercialReportType.PRICING_SIMULATIONS: CommercialReportFormat.CSV,
    CommercialReportType.PRICING_RULES: CommercialReportFormat.PDF,
}


class CommercialExportCreate(BaseModel):
    organization_id: UUID
    report_type: CommercialReportType
    reason: str = Field(min_length=8, max_length=500)


class CommercialExportOut(BaseModel):
    export_id: UUID
    organization_id: UUID
    report_type: CommercialReportType
    status: str
    file_format: CommercialReportFormat
    created_at: datetime
    completed_at: datetime | None = None
    expires_at: datetime | None = None
    failure_reason: str | None = None


class CommercialExportDownload(BaseModel):
    download_url: str
    filename: str
    expires_in: int
