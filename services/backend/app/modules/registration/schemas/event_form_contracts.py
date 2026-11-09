"""Non-executable live form configuration and explicit scoring criteria."""
import uuid
from typing import Annotated
from pydantic import BaseModel, ConfigDict, Field, StrictBool, StrictFloat, StrictInt, StrictStr
from .catalogue_contracts import CatalogueDocument, CatalogueSettings

MAX_EVALUATION_RUBRIC_CRITERIA = 20
ReviewScores = Annotated[dict[
    Annotated[StrictStr, Field(min_length=1, max_length=100, pattern=r"^[a-zA-Z0-9_-]+$")],
    Annotated[StrictInt, Field(ge=0, le=1000)]], Field(max_length=MAX_EVALUATION_RUBRIC_CRITERIA)]


class EventFormSettings(CatalogueSettings):
    allow_drafts: StrictBool | None = None
    show_word_count: StrictBool | None = None
    terms_and_conditions: Annotated[StrictStr, Field(max_length=65536)] | None = None


class EventFormDocument(CatalogueDocument):
    settings: EventFormSettings = Field(default_factory=EventFormSettings)


class RubricCriterion(BaseModel):
    # This is deliberately not an arbitrary dictionary or a scoring expression.
    key: Annotated[StrictStr, Field(min_length=1, max_length=100, pattern=r"^[a-zA-Z0-9_-]+$")] | None = None
    label: Annotated[StrictStr, Field(min_length=1, max_length=255)]
    description: Annotated[StrictStr, Field(max_length=2000)] = ""
    max: StrictInt | StrictFloat = Field(10, gt=0, le=1000)
    weight: StrictInt | StrictFloat = Field(ge=0, le=100)
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)


def form_document(fields, settings, *, stored=False, event_id=None):
    """Only stored projections may contain validated server-owned provenance."""
    if not isinstance(settings, dict):
        raise ValueError("Invalid form settings.")
    settings = dict(settings)
    metadata = {}
    for key in ("event_id", "_event_id", "_source_template_id", "template_slug"):
        if key not in settings:
            continue
        value = settings.pop(key)
        if not stored:
            raise ValueError("Form provenance is server-controlled.")
        if key == "template_slug":
            # Legacy display metadata is never propagated into a new document.
            continue
        parsed = uuid.UUID(str(value))
        if key in {"event_id", "_event_id"} and event_id is not None and parsed != event_id:
            raise ValueError("Form belongs to a different event.")
        metadata[key] = str(parsed)
    if metadata.get("event_id") and metadata.get("_event_id") and metadata["event_id"] != metadata["_event_id"]:
        raise ValueError("Conflicting form event ownership.")
    if not isinstance(fields, list) or len(fields) > 100:
        raise ValueError("Invalid form fields.")
    normalized = []
    for field in fields:
        if not isinstance(field, dict):
            raise ValueError("Invalid form field.")
        item = dict(field)
        if stored and "required" in item:
            # Historical event-form storage used this explicit boolean alias.
            # Never coerce strings/numbers or choose between conflicting values.
            legacy_required = item.pop("required")
            if type(legacy_required) is not bool or (
                    "is_required" in item and (type(item["is_required"]) is not bool
                        or item["is_required"] != legacy_required)):
                raise ValueError("Conflicting or invalid historical required flag.")
            item["is_required"] = legacy_required
        # Compatibility for existing explicit fields, not authority inference.
        item.setdefault("name", item.get("id"))
        item.setdefault("label", item.get("name") or item.get("id"))
        normalized.append(item)
    result = EventFormDocument.model_validate({"fields": normalized, "settings": settings}).model_dump(
        mode="json", exclude_none=True)
    if stored:
        result["settings"].update(metadata)
    return result


def public_form_projection(fields, settings, *, event_id):
    """Allowlisted public form document with no lineage or submitted defaults."""
    result = form_document(fields, settings, stored=True, event_id=event_id)
    for field in result["fields"]:
        # Defaults can contain copied personal or credential-like values. Public
        # form definitions describe questions, never a prior subject's answer.
        field.pop("default_value", None)
    for key in ("event_id", "_event_id", "_source_template_id", "template_slug"):
        result["settings"].pop(key, None)
    return result


def rubric_projection(rows):
    if not isinstance(rows, list) or len(rows) > 100:
        raise ValueError("Invalid rubric.")
    result = [RubricCriterion.model_validate(row).model_dump(mode="json", exclude_none=True) for row in rows]
    labels, keys = set(), set()
    for row in result:
        label = row["label"].strip().casefold()
        key = row.get("key")
        if (not label or label in labels or
                (key is not None and (key in keys or key in {"__proto__", "prototype", "constructor"}))):
            raise ValueError("Rubric criteria must be unique.")
        labels.add(label)
        if key is not None:
            keys.add(key)
    if result and abs(sum(row["weight"] for row in result) - 100) > 0.000001:
        raise ValueError("Rubric weights must total 100.")
    return result


def evaluation_rubric_projection(rows):
    # Apply the live evaluation-plan contract to stored documents and public
    # consumers too. Abstract-form rubrics intentionally retain their separate
    # 100-criterion bound; never truncate historical scoring definitions.
    if not isinstance(rows, list) or len(rows) > MAX_EVALUATION_RUBRIC_CRITERIA:
        raise ValueError("Evaluation rubrics allow at most 20 criteria.")
    result = rubric_projection(rows)
    if any(not row.get("key") for row in result):
        raise ValueError("Evaluation criteria require explicit scoring keys.")
    return result


def abstract_schema_projection(schema, *, stored=False, event_id=None):
    if not isinstance(schema, dict) or set(schema) - {"fields", "settings", "template_id", "rubric"}:
        raise ValueError("Unsupported abstract form schema.")
    result = form_document(schema.get("fields", []), schema.get("settings", {}),
        stored=stored, event_id=event_id)
    if "rubric" in schema:
        result["rubric"] = rubric_projection(schema["rubric"])
    if schema.get("template_id") is not None:
        identifier = schema["template_id"]
        if identifier != "tpl_abstract_submission":
            identifier = str(uuid.UUID(str(identifier)))
        result["template_id"] = identifier
    return result
