import re

file_path = r'd:\DEV\conf-platform\services\backend\alembic\versions\20260610_0536_1b39bb2f0e3d_enterprise_schema_v2.py'
with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

# Replace registration.roles -> registration.participants_roles
content = content.replace("op.create_table('roles',", "op.create_table('###ROLES###',")

# We need to distinguish between rbac and registration
# Let's find the create_table blocks
def replace_table_block(match):
    block = match.group(0)
    if "schema='registration'" in block:
        return block.replace("'###ROLES###'", "'participants_roles'")
    elif "schema='rbac'" in block:
        return block.replace("'###ROLES###'", "'user_roles'")
    return block

content = re.sub(r"op\.create_table\('###ROLES###'.*?\)", replace_table_block, content, flags=re.DOTALL)

# Replace foreign keys referencing registration.roles
content = content.replace("'registration.roles.id'", "'registration.participants_roles.id'")
# Replace foreign keys referencing rbac.roles
content = content.replace("'rbac.roles.id'", "'rbac.user_roles.id'")

# Replace indexes for registration.roles
content = content.replace("'roles', ['event_id']", "'###TABLENAME###', ['event_id']")
content = content.replace("'roles', ['name']", "'###TABLENAME###', ['name']")
content = content.replace("'roles', ['organization_id']", "'###TABLENAME###', ['organization_id']")
content = content.replace("'roles', ['deleted_at']", "'###TABLENAME###', ['deleted_at']")

def replace_index(match):
    block = match.group(0)
    if "schema='registration'" in block:
        block = block.replace("'###TABLENAME###'", "'participants_roles'")
        block = block.replace("ix_registration_roles_", "ix_registration_participants_roles_")
    elif "schema='rbac'" in block:
        block = block.replace("'###TABLENAME###'", "'user_roles'")
        block = block.replace("ix_rbac_roles_", "ix_rbac_user_roles_")
    return block

content = re.sub(r"op\.create_index.*?schema='.*?'\)", replace_index, content)

# Also fix the drop_table at the end
content = content.replace("op.drop_table('roles', schema='registration')", "op.drop_table('participants_roles', schema='registration')")
content = content.replace("op.drop_index('ix_registration_roles_", "op.drop_index('ix_registration_participants_roles_")
content = content.replace("op.drop_table('roles', schema='rbac')", "op.drop_table('user_roles', schema='rbac')")
content = content.replace("op.drop_index('ix_rbac_roles_", "op.drop_index('ix_rbac_user_roles_")

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(content)

print("Migration updated.")
