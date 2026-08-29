import re

file_path = 'app/modules/operations_control/router.py'
with open(file_path, 'r') as f:
    content = f.read()

# Remove import
content = re.sub(r'from app\.modules\.search\.models\.search import SearchJob\n', '', content)

# Remove SearchJob references
content = re.sub(r'async def _search_job_for_control.*?return job\n\n\n', '', content, flags=re.DOTALL)
content = re.sub(r'@router\.post\("/jobs/\{source\}/\{job_id\}/control"\).*?return \{"id": control\.id, "status": control\.status, "successor_job_id": control\.successor_job_id\}\n\n\n', '', content, flags=re.DOTALL)
content = re.sub(r'@router\.get\("/jobs/\{source\}/\{job_id\}"\).*?"cancel": job\.status in \{"pending", "queued"\}\}\}\n\n\n', '', content, flags=re.DOTALL)

with open(file_path, 'w') as f:
    f.write(content)
