import re

file_path = 'app/modules/platform/services/lifecycle_service.py'
with open(file_path, 'r') as f:
    content = f.read()

# Remove OrganizationLegalHold import
content = re.sub(r'\s*OrganizationLegalHold,?', '', content)

with open(file_path, 'w') as f:
    f.write(content)
