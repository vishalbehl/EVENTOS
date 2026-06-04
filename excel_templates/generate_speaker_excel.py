
"""
Generate Speaker Agenda Excel from Registration Export

Requirements:
pip install pandas openpyxl faker

Input:
- registration_roster_500_corrected.xlsx

Output:
- generated_speaker_agenda.xlsx

Logic:
- Uses ONLY participants whose Registration Category contains Speaker/SPK
- Maps participant details into speaker columns
- Creates multiple sessions, rooms and talks
- Reuses speakers across sessions where needed
- Generates AI Impact Summit themed agenda
"""

import pandas as pd
import random
from faker import Faker

fake = Faker()

INPUT_FILE = "excel_templates/registration_roster_500_corrected.xlsx"
OUTPUT_FILE = "excel_templates/generated_speaker_agenda.xlsx"

ROOMS = [
    "Hall A",
    "Hall B",
    "Hall C",
    "Hall D",
    "Hall E",
    "Hall F",
]

SESSION_TYPES = [
    "Keynote",
    "Technical Session",
    "Panel Discussion",
    "Workshop",
    "Industry Forum"
]

MODERATORS = [
    "Dr. Sarah Johnson",
    "Prof. Michael Chen",
    "Dr. Emily Wilson",
    "Rajesh Kumar",
    "Priya Mehta",
    "David Thompson"
]

AI_TOPICS = [
    "Generative AI for Enterprise",
    "AI Governance and Compliance",
    "Responsible AI Frameworks",
    "Future of Agentic AI",
    "LLMs in Healthcare",
    "AI Powered Cyber Security",
    "Autonomous Systems",
    "AI for Smart Cities",
    "Computer Vision at Scale",
    "Multimodal AI Applications",
    "AI Infrastructure and GPUs",
    "Building AI Products",
    "AI in Financial Services",
    "Machine Learning Operations",
    "AI and Data Privacy",
    "Enterprise RAG Architectures",
    "Future of AI Workforce",
    "AI in Education",
    "Synthetic Data Generation",
    "AI Transformation Strategy"
]

df = pd.read_excel(INPUT_FILE)

speaker_df = df[
    df["Registration Category *"].astype(str).str.contains(
        "Speaker", case=False, na=False
    )
].copy()

records = []

conference_days = [
    "2026-10-01",
    "2026-10-02",
    "2026-10-03"
]

session_counter = 1

for day in conference_days:

    for session_num in range(1, 16):

        session_code = f"S{session_counter:03d}"
        session_name = random.choice(AI_TOPICS)
        session_type = random.choice(SESSION_TYPES)
        room = random.choice(ROOMS)

        session_start_hour = random.randint(9, 16)
        session_start = pd.Timestamp(
            f"{day} {session_start_hour:02d}:00:00"
        )
        session_end = session_start + pd.Timedelta(minutes=60)

        moderator = random.choice(MODERATORS)

        talk_count = random.randint(2, 5)

        selected_speakers = speaker_df.sample(
            min(talk_count, len(speaker_df)),
            replace=False
        )

        talk_start = session_start

        order = 1

        for _, spk in selected_speakers.iterrows():

            duration = random.choice([10, 15, 20])

            talk_end = talk_start + pd.Timedelta(minutes=duration)

            records.append({
                "Session Code": session_code,
                "Session Name": session_name,
                "Session Type": session_type,
                "Room Name": room,
                "Start Datetime": session_start,
                "End Datetime": session_end,
                "Speaker First Name": spk["First Name *"],
                "Speaker Last Name": spk["Last Name *"],
                "Speaker Email": spk["Email Address *"],
                "Speaker Phone": spk["Phone Number"],
                "Speaker Affiliation": spk["Company/Affiliation"],
                "Speaker Country": spk["Country"],
                "Speaker Designation": spk["Job Title/Designation"],
                "Presentation Title": random.choice(AI_TOPICS),
                "Talk Start": talk_start,
                "Talk End": talk_end,
                "Talk Order": order,
                "Talk Duration": duration,
                "Moderator Name": moderator
            })

            talk_start = talk_end
            order += 1

        session_counter += 1

agenda_df = pd.DataFrame(records)
agenda_df.to_excel(OUTPUT_FILE, index=False)

print(f"Generated: {OUTPUT_FILE}")
