file_path = r'd:\DEV\conf-platform\services\backend\app\modules\rbac\models\rbac.py'
with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

content = content.replace('__tablename__ = "roles"', '__tablename__ = "user_roles"')
content = content.replace('ForeignKey("rbac.roles.id"', 'ForeignKey("rbac.user_roles.id"')

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(content)

print("rbac.py updated.")
