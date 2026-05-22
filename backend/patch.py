import re

with open('template_scratch.html', 'r', encoding='utf-8') as f:
    html = f.read()

with open('seed_templates.py', 'r', encoding='utf-8') as f:
    seed = f.read()

start_marker = '        "body_html": """\n            <div style="font-family: sans-serif;'
end_marker = '            </div>\n        """,'

start_idx = seed.find(start_marker)
if start_idx != -1:
    end_idx = seed.find(end_marker, start_idx) + len(end_marker)
    
    new_seed = seed[:start_idx] + '        "body_html": """\n' + html + '\n        """,' + seed[end_idx:]
    with open('seed_templates.py', 'w', encoding='utf-8') as f:
        f.write(new_seed)
    print("Patched successfully!")
else:
    print("Could not find start marker.")
