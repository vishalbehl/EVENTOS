file_path = r'd:\DEV\conf-platform\services\backend\app\modules\registration\models\participant.py'
with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

content = content.replace('ForeignKey("registration.roles.id"', 'ForeignKey("registration.participants_roles.id"')

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(content)

print("participant.py updated.")
