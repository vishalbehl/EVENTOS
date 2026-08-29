import re

file_path = 'app/routers/__init__.py'
with open(file_path, 'r') as f:
    content = f.read()

content = re.sub(r'from app\.modules\.technology_services\.router import router as technology_services_router\n?', '', content)
content = re.sub(r'from app\.modules\.procurement\.router import router as procurement_router\n?', '', content)

content = re.sub(r'api_router\.include_router\(technology_services_router, prefix="/v1"\)\n?', '', content)
content = re.sub(r'api_router\.include_router\(procurement_router, prefix="/v1"\)\n?', '', content)

with open(file_path, 'w') as f:
    f.write(content)
