import json
import sys

transcript_path = r"C:\Users\visha\.gemini\antigravity-ide\brain\52ce8cff-8e9c-4ada-b7de-e04aaa852ae3\.system_generated\logs\transcript.jsonl"

with open(transcript_path, "r", encoding="utf-8", errors="replace") as f:
    for line in f:
        try:
            data = json.loads(line)
            if data.get("type") == "USER_INPUT":
                print(f"=== STEP {data.get('step_index')} ===")
                print(data.get("content"))
                print()
        except Exception as e:
            pass
