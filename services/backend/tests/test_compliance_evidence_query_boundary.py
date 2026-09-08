from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def test_compliance_evidence_list_delegates_to_query_service():
    source = (ROOT / "app/modules/platform/organization_console_router.py").read_text(encoding="utf-8")
    region = source.split("async def list_compliance_evidence", 1)[1].split("async def create_compliance_evidence", 1)[0]
    assert "ComplianceEvidenceQueryService(db).list_for_control" in region
    assert "select(OrganizationComplianceEvidence)" not in region


def test_compliance_evidence_query_is_scoped_bounded_projected_and_stable():
    source = (ROOT / "app/modules/platform/application/queries.py").read_text(encoding="utf-8")
    region = source.split("class ComplianceEvidenceQueryService", 1)[1].split("class CommercialAccessQueryService", 1)[0]
    assert "OrganizationComplianceControl.organization_id == organization_id" in region
    assert "OrganizationComplianceEvidence.organization_id == organization_id" in region
    assert "OrganizationComplianceEvidence.control_id == control_id" in region
    assert "max(1, min(int(limit), 100))" in region
    assert "load_only(*self._COLUMNS)" in region
    assert "OrganizationComplianceEvidence.collected_at.desc()" in region
    assert "OrganizationComplianceEvidence.id.desc()" in region
