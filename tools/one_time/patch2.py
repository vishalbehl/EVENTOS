import re

with open('template_scratch.html', 'r', encoding='utf-8') as f:
    html = f.read()

with open('app/tasks/seed_email_data.py', 'r', encoding='utf-8') as f:
    seed = f.read()

start_marker = '    "body_html": """<p>Dear {{SpeakerName}},</p>'
end_marker = '    "body_html": """<p>Dear {{SpeakerName}},</p>' # just find the first occurrence and the end of its multiline string

start_idx = seed.find(start_marker)
if start_idx != -1:
    end_idx = seed.find('"""', start_idx + len('    "body_html": """')) + 3
    
    new_seed = seed[:start_idx] + '    "body_html": """\n' + html + '\n"""' + seed[end_idx:]
    with open('app/tasks/seed_email_data.py', 'w', encoding='utf-8') as f:
        f.write(new_seed)
    print("Patched seed_email_data.py successfully!")
else:
    print("Could not find start marker in seed_email_data.py.")
