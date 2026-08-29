import re

file_path = 'app/models/__init__.py'
with open(file_path, 'r') as f:
    content = f.read()

# Remove specific imports using regex
modules_to_remove = ['technology_services', 'procurement']

for mod in modules_to_remove:
    pattern = r'(# ' + mod + r' models\n)?from app\.modules\.' + mod + r'\.models.*?(\n\)|(?=\n\n|\n#))'
    content = re.sub(pattern, '', content, flags=re.DOTALL)

with open(file_path, 'w') as f:
    f.write(content)
