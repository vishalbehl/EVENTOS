import re

file_path = 'app/routers/__init__.py'
with open(file_path, 'r') as f:
    content = f.read()

content = re.sub(r'api_router\.include_router\(procurement_router\)\n', '', content)

with open(file_path, 'w') as f:
    f.write(content)
