import re
import os

init_path = r'd:\DEV\conf-platform\services\backend\app\tasks\__init__.py'
with open(init_path, 'r', encoding='utf-8') as f:
    content = f.read()

content = re.sub(r',\s*low_stock_alerts,\s*maintenance_reminders', '', content)
content = re.sub(r'from \.operations_jobs import \([\s\S]*?\)', '', content)
content = re.sub(r'from \.operations_jobs import .*', '', content)

with open(init_path, 'w', encoding='utf-8') as f:
    f.write(content)


pct_path = r'd:\DEV\conf-platform\services\backend\app\tasks\platform_commercial_tasks.py'
with open(pct_path, 'r', encoding='utf-8') as f:
    content = f.read()

content = re.sub(r'from app.modules.inventory.models import HardwareItem, HardwareStock\n', '', content)

# Remove the two tasks using regex
content = re.sub(r'@celery_app\.task\(name="app\.tasks\.platform_commercial\.low_stock_alerts"\)[\s\S]*?return _run_async\(_check\(\)\)\n\n\n', '', content)
content = re.sub(r'@celery_app\.task\(name="app\.tasks\.platform_commercial\.maintenance_reminders"\)[\s\S]*?return _run_async\(_remind\(\)\)\n', '', content)


with open(pct_path, 'w', encoding='utf-8') as f:
    f.write(content)

print("Updated imports and removed deprecated tasks.")
