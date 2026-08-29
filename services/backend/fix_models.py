import sys
import re

with open('app/models/__init__.py', 'r') as f:
    content = f.read()

# Remove specific imports using regex
modules_to_remove = ['search', 'mobile', 'inventory', 'resource_management', 'deployment_management', 'operations_planning']

for mod in modules_to_remove:
    pattern = r'(# ' + mod + r' models\n)?from app\.modules\.' + mod + r'\.models.*?(\n\)|(?=\n\n|\n#))'
    content = re.sub(pattern, '', content, flags=re.DOTALL)

with open('app/models/__init__.py', 'w') as f:
    f.write(content)
