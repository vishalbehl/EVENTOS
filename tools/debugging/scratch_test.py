from app.modules.events.models.speaker import Speaker
import uuid

sp = Speaker(
    first_name="Alice",
    last_name="Smith",
    email="alice@example.com",
    upload_token="test_token",
    speaker_code="TESTCODE",
)
print("sp.speaker_code:", sp.speaker_code)
print("sp.upload_token:", sp.upload_token)
