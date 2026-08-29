import re

file_path = 'app/modules/platform/services/lifecycle_service.py'
with open(file_path, 'r') as f:
    content = f.read()

content = content.replace('OrganizationLifecycleJob,', 'OrganizationBrandProfile,\n    OrganizationLifecycleJob,')

with open(file_path, 'w') as f:
    f.write(content)
