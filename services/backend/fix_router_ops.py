import re

file_path = 'app/modules/operations_control/router.py'
with open(file_path, 'r') as f:
    content = f.read()

# Remove imports
content = re.sub(r'from app\.modules\.deployment_management\.models import .*?\n', '', content)
content = re.sub(r'from app\.modules\.operations_planning\.models import .*?\n', '', content)
content = re.sub(r'from app\.modules\.technology_services\.models import .*?\n', '', content)

# Remove Pydantic models related to Request, Risk, RiskActionIn, RiskCommentIn, RiskEvidenceIn, RiskDecision
content = re.sub(r'class RequestPatch\(BaseModel\):.*?reason: str = Field\(min_length=12, max_length=1000\)\n\n\n', '', content, flags=re.DOTALL)
content = re.sub(r'class RequestAssign\(BaseModel\):.*?reason: str = Field\(min_length=12, max_length=1000\)\n\n\n', '', content, flags=re.DOTALL)
content = re.sub(r'class RequestTransition\(BaseModel\):.*?reason: str = Field\(min_length=12, max_length=1000\)\n\n\n', '', content, flags=re.DOTALL)
content = re.sub(r'REQUEST_TRANSITIONS = \{.*?\n\}\n\n\n', '', content, flags=re.DOTALL)
content = re.sub(r'class RiskCreate\(BaseModel\):.*?reason: str = Field\(min_length=12, max_length=1000\)\n\n\n', '', content, flags=re.DOTALL)
content = re.sub(r'class RiskPatch\(BaseModel\):.*?reason: str = Field\(min_length=12, max_length=1000\)\n\n\n', '', content, flags=re.DOTALL)
content = re.sub(r'class RiskActionIn\(BaseModel\):.*?reason: str = Field\(min_length=12\)\n\n\n', '', content, flags=re.DOTALL)
content = re.sub(r'class RiskCommentIn\(BaseModel\):.*?comment: str = Field\(min_length=2, max_length=5000\)\n\n\n', '', content, flags=re.DOTALL)
content = re.sub(r'class RiskEvidenceIn\(BaseModel\):.*?reason: str = Field\(min_length=12\)\n\n\n', '', content, flags=re.DOTALL)
content = re.sub(r'class RiskDecision\(BaseModel\):.*?reason: str = Field\(min_length=12, max_length=2000\)\n\n\n', '', content, flags=re.DOTALL)

# Remove functions
content = re.sub(r'async def _request_for_org.*?return row\n\n\n', '', content, flags=re.DOTALL)
content = re.sub(r'async def _risk_for_org.*?return row\[0\], row\[1\]\n\n\n', '', content, flags=re.DOTALL)
content = re.sub(r'def _request_dict.*?updated_at\}\n\n\n', '', content, flags=re.DOTALL)
content = re.sub(r'def _risk_dict.*?resolved_at\}\n\n\n', '', content, flags=re.DOTALL)

# Remove endpoints
content = re.sub(r'@router\.get\("/requests"\).*?len\(rows\) > limit\}\n\n\n', '', content, flags=re.DOTALL)
content = re.sub(r'@router\.get\("/requests/\{request_id\}"\).*?sla\.resolved_at\}\}\n\n\n', '', content, flags=re.DOTALL)
content = re.sub(r'@router\.patch\("/requests/\{request_id\}"\).*?return _request_dict\(row\)\n\n\n', '', content, flags=re.DOTALL)
content = re.sub(r'@router\.post\("/requests/\{request_id\}/assign"\).*?status": "ACTIVE"\}\n\n\n', '', content, flags=re.DOTALL)
content = re.sub(r'@router\.post\("/requests/\{request_id\}/transition"\).*?return _request_dict\(row\)\n\n\n', '', content, flags=re.DOTALL)

content = re.sub(r'@router\.get\("/risks"\).*?r, p in rows\]\}\n\n\n', '', content, flags=re.DOTALL)
content = re.sub(r'@router\.get\("/projects"\).*?for row in rows\]\}\n\n\n', '', content, flags=re.DOTALL)
content = re.sub(r'@router\.get\("/risks/\{risk_id\}"\).*?for e in evidence\]\}\n\n\n', '', content, flags=re.DOTALL)
content = re.sub(r'@router\.post\("/risks", status_code=201\).*?return _risk_dict\(risk, project\)\n\n\n', '', content, flags=re.DOTALL)
content = re.sub(r'@router\.patch\("/risks/\{risk_id\}"\).*?return _risk_dict\(risk, project\)\n\n\n', '', content, flags=re.DOTALL)
content = re.sub(r'@router\.post\("/risks/\{risk_id\}/actions".*?return \{"id": action\.id, "status": action\.status\}\n\n\n', '', content, flags=re.DOTALL)
content = re.sub(r'@router\.post\("/risks/\{risk_id\}/comments".*?return \{"id": comment\.id, "created_at": comment\.created_at\}\n\n\n', '', content, flags=re.DOTALL)
content = re.sub(r'@router\.post\("/risks/\{risk_id\}/evidence".*?return \{"id": evidence\.id\}\n\n\n', '', content, flags=re.DOTALL)
content = re.sub(r'@router\.post\("/risks/\{risk_id\}/accept"\).*?return _risk_dict\(risk, project\)\n\n\n', '', content, flags=re.DOTALL)
content = re.sub(r'@router\.post\("/risks/\{risk_id\}/resolve"\).*?return _risk_dict\(risk, project\)\n\n\n', '', content, flags=re.DOTALL)

# Fix operations_overview by removing requests and risks
content = re.sub(r'    requests_stmt = select\(func\.count\(ServiceRequest\.id\)\).*?open operational requests\."\}\)\n\n', '', content, flags=re.DOTALL)
content = re.sub(r'    risk_stmt = select\(func\.count\(Risk\.id\)\).*?unresolved operational risks\."\}\)\n\n', '', content, flags=re.DOTALL)

with open(file_path, 'w') as f:
    f.write(content)
