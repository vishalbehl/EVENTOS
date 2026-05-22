
import uuid
from datetime import datetime, timezone
from pydantic import ValidationError
from app.modules.presentations.schemas.file import PresentationFileResponse

# Mock data matching PresentationFile model
mock_data = {
    "id": uuid.uuid4(),
    "speaker_id": uuid.uuid4(),
    "session_speaker_id": uuid.uuid4(),
    "event_id": uuid.uuid4(),
    "speaker_name": "John Doe",
    "session_name": "Keynote",
    "session_start_time": datetime.now(timezone.utc),
    "original_filename": "test.pptx",
    "stored_filename": "uuid.pptx",
    "storage_path": "path/to/file",
    "file_format": "pptx",
    "file_size_bytes": 1024,
    "version_number": 1,
    "is_current_version": True,
    "upload_source": "portal",
    "upload_status": "pending_validation",
    "approved_by": None,
    "approved_at": None,
    "rejection_reason": None,
    "is_locked": False,
    "local_sync_status": "pending",
    "uploaded_at": datetime.now(timezone.utc),
    "validation": None
}

try:
    res = PresentationFileResponse.model_validate(mock_data)
    print("Validation successful")
except ValidationError as e:
    print("Validation failed:")
    print(e.json(indent=2))
