import sys
import os
import uuid
from datetime import datetime

# Set PYTHONPATH
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.services.email_service import build_speaker_variables

class MockSpeaker:
    def __init__(self, first_name, last_name, email, qr_code_url, speaker_code, presentation_files=None):
        self.first_name = first_name
        self.last_name = last_name
        self.email = email
        self.qr_code_url = qr_code_url
        self.speaker_code = speaker_code
        self.presentation_files = presentation_files or []

class MockPresentationFile:
    def __init__(self, original_filename, rejection_reason, upload_status="rejected", file_size_bytes=14889728):
        self.original_filename = original_filename
        self.rejection_reason = rejection_reason
        self.upload_status = upload_status
        self.file_size_bytes = file_size_bytes
        self.session_speaker = None

class MockSession:
    def __init__(self, name, start_time=None):
        self.name = name
        self.start_time = start_time or datetime.now()

def run_tests():
    print("--- Running Variable Substitution Tests ---")
    
    # 1. Test standard mock speaker with rejection reason passed as argument
    speaker1 = MockSpeaker("John", "Doe", "john.doe@example.com", "https://example.com/qr1.png", "SPK-001")
    session1 = MockSession("Intro to AI")
    
    vars1 = build_speaker_variables(
        speaker1, session1, "Global AI Summit",
        upload_url="https://example.com/upload/john",
        rejection_reason="The presentation file is corrupt."
    )
    
    assert vars1["RejectionReason"] == "The presentation file is corrupt."
    assert vars1["RejectedReason"] == "The presentation file is corrupt."
    assert "corrupt" in vars1["RejectedPresentationTable"]
    print("[SUCCESS] Test 1: Explicit rejection reason and table fallback works perfectly!")

    # 2. Test speaker with lazy-loaded relationship emulation (relationship present, no arg)
    file1 = MockPresentationFile("ai_intro_deck.pptx", "Slide 5 needs higher resolution images.")
    speaker2 = MockSpeaker("Jane", "Smith", "jane.smith@example.com", "https://example.com/qr2.png", "SPK-002", [file1])
    
    vars2 = build_speaker_variables(
        speaker2, session1, "Global AI Summit",
        upload_url="https://example.com/upload/jane"
    )
    
    assert vars2["RejectionReason"] == "Slide 5 needs higher resolution images."
    assert vars2["RejectedReason"] == "Slide 5 needs higher resolution images."
    assert "ai_intro_deck.pptx" in vars2["RejectedPresentationTable"]
    assert "Slide 5 needs" in vars2["RejectedPresentationTable"]
    assert "14.20 MB" in vars2["RejectedPresentationTable"]
    print("[SUCCESS] Test 2: Dynamic lookup of rejection reason and files table works perfectly!")

if __name__ == "__main__":
    run_tests()
