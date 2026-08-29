file_path = r'd:\DEV\conf-platform\services\backend\alembic\versions\20260610_0536_1b39bb2f0e3d_enterprise_schema_v2.py'
with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

# Split by ###ROLES### and replace the first with user_roles, second with participants_roles
parts = content.split('###ROLES###')
if len(parts) == 3:
    content = parts[0] + 'user_roles' + parts[1] + 'participants_roles' + parts[2]
    with open(file_path, 'w', encoding='utf-8') as f:
        f.write(content)
    print("Fixed ###ROLES###")
else:
    print(f"Expected 3 parts, got {len(parts)}")
