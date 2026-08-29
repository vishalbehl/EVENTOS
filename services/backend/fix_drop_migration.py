import re

file_path = r'd:\DEV\conf-platform\services\backend\alembic\versions\20260610_0536_1b39bb2f0e3d_enterprise_schema_v2.py'
with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

# Fix the drop_index table_name issues
content = content.replace("table_name='roles', schema='registration'", "table_name='participants_roles', schema='registration'")
content = content.replace("table_name='roles', schema='rbac'", "table_name='user_roles', schema='rbac'")

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(content)

print("Migration drop fixes applied.")
