import re

files_to_fix = [
    'app/models/__init__.py',
    'app/modules/platform/models/__init__.py'
]

imports_to_remove = [
    'OrganizationComplianceControl',
    'OrganizationComplianceEvidence',
    'OrganizationPrivacyRequest',
    'OrganizationRetentionPolicy',
    'OrganizationLegalHold'
]

for file_path in files_to_fix:
    with open(file_path, 'r') as f:
        content = f.read()
    
    for imp in imports_to_remove:
        content = re.sub(r'\s*' + imp + r',?', '', content)
    
    with open(file_path, 'w') as f:
        f.write(content)

