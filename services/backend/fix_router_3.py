import re

file_path = 'app/modules/superadmin/router.py'
with open(file_path, 'r') as f:
    content = f.read()

content = re.sub(r'from app\.modules\.search\.routers\.search import router as search_router\n', '', content)
content = re.sub(r'superadmin_router\.include_router\(search_router\)\n', '', content)

with open(file_path, 'w') as f:
    f.write(content)
