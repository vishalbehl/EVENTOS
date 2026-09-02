import glob
import os

files = glob.glob('*.py')
for f in files:
    content = open(f).read()
    new_content = content.replace('from app.models.venue_user import VenueUser', 'from app.models.venue_user import VenueUser')
    new_content = new_content.replace('"VenueUser"', '"VenueUser"')
    if new_content != content:
        open(f, 'w').write(new_content)
        print(f"Updated {f}")
