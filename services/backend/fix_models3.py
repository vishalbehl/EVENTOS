import re

file_path = 'app/modules/platform/services/organization_console_service.py'
with open(file_path, 'r') as f:
    content = f.read()

# Also need to remove the imports of the compliance models
imports_to_remove = [
    'OrganizationComplianceControl',
    'OrganizationComplianceEvidence',
    'OrganizationPrivacyRequest',
    'OrganizationRetentionPolicy',
    'OrganizationLegalHold'
]
for imp in imports_to_remove:
    content = re.sub(r'\s*' + imp + r',?', '', content)

with open(file_path, 'w') as f:
    f.write(content)
