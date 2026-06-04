from dataclasses import dataclass

@dataclass
class SpeakerTypeConfig:
    code: str
    label: str
    upload_required: bool
    default_duration_minutes: int
    programme_order: int
    badge_color: str

SPEAKER_TYPES = [
    SpeakerTypeConfig(
        code="KEY",
        label="Keynote Speaker",
        upload_required=True,
        default_duration_minutes=45,
        programme_order=1,
        badge_color="#f59e0b",
    ),
    SpeakerTypeConfig(
        code="INV",
        label="Invited Speaker",
        upload_required=True,
        default_duration_minutes=25,
        programme_order=2,
        badge_color="#3b82f6",
    ),
    SpeakerTypeConfig(
        code="ORL",
        label="Oral Presenter",
        upload_required=True,
        default_duration_minutes=12,
        programme_order=3,
        badge_color="#6366f1",
    ),
    SpeakerTypeConfig(
        code="PST",
        label="Poster Presenter",
        upload_required=False,
        default_duration_minutes=0,
        programme_order=4,
        badge_color="#10b981",
    ),
    SpeakerTypeConfig(
        code="PNL",
        label="Panel Member",
        upload_required=False,
        default_duration_minutes=0,
        programme_order=5,
        badge_color="#8b5cf6",
    ),
    SpeakerTypeConfig(
        code="MOD",
        label="Moderator / Chair",
        upload_required=False,
        default_duration_minutes=0,
        programme_order=6,
        badge_color="#64748b",
    ),
    SpeakerTypeConfig(
        code="WRK",
        label="Workshop Leader",
        upload_required=True,
        default_duration_minutes=90,
        programme_order=7,
        badge_color="#f97316",
    ),
    SpeakerTypeConfig(
        code="ORA",
        label="Oration Awardee",
        upload_required=True,
        default_duration_minutes=30,
        programme_order=8,
        badge_color="#ec4899",
    ),
    SpeakerTypeConfig(
        code="VIR",
        label="Virtual Speaker",
        upload_required=True,
        default_duration_minutes=20,
        programme_order=9,
        badge_color="#06b6d4",
    ),
    SpeakerTypeConfig(
        code="IND",
        label="Industry Speaker",
        upload_required=True,
        default_duration_minutes=20,
        programme_order=10,
        badge_color="#84cc16",
    ),
]

SPEAKER_TYPE_MAP: dict[str, SpeakerTypeConfig] = {t.code: t for t in SPEAKER_TYPES}
UPLOAD_REQUIRED_CODES: list[str] = [t.code for t in SPEAKER_TYPES if t.upload_required]
