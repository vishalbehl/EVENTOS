"""Pure mapping checks; runnable without the database-backed root fixtures."""
import uuid

import pytest

from scripts.reconcile_catalogue_duplicates import _template_identity, _reconcile_template


def row(**changes):
    value = dict(id=uuid.uuid4(), organization_id=None, slug="shared-slug", is_active=True,
        is_default=False, deleted_at=None, version=1, category_key="registration",
        scope_type="GLOBAL", settings={}, category_id=None)
    value.update(changes)
    return value


@pytest.mark.parametrize("changes", [
    {"category_key": ""}, {"category_key": None}, {"scope_type": "LEGACY"},
    {"scope_type": "ORGANIZATION"}, {"organization_id": uuid.uuid4()},
    {"scope_type": "EVENT", "organization_id": uuid.uuid4(), "settings": {}},
    {"scope_type": "EVENT", "organization_id": uuid.uuid4(), "settings": []},
    {"scope_type": "EVENT", "organization_id": uuid.uuid4(), "settings": {"_event_id": "bad"}},
    {"scope_type": "EVENT", "organization_id": uuid.uuid4(), "settings": {
        "_event_id": str(uuid.uuid4()), "event_id": str(uuid.uuid4())}},
])
def test_invalid_operational_identity_fails_closed(changes):
    value = row()
    value.update(changes)
    with pytest.raises(RuntimeError):
        _template_identity(value)


def test_equivalent_event_marker_spellings_have_same_identity():
    event_id = uuid.uuid4()
    a, b = row(), row()
    for value in (a, b):
        value.update(scope_type="EVENT", organization_id=uuid.uuid4())
    a["settings"] = {"_event_id": str(event_id)}
    b["settings"] = {"event_id": str(event_id).upper(), "_event_id": str(event_id)}
    assert _template_identity(a) == _template_identity(b) == ("registration", "EVENT", event_id)


@pytest.mark.parametrize("changes", [
    {"category_key": "abstract"}, {"scope_type": "ORGANIZATION"},
])
def test_incompatible_mapping_rejected_before_any_write(changes):
    source, replacement = row(), row()
    replacement.update(changes)
    class ReadOnlyConnection:
        def __init__(self):
            self.calls = 0
        def execute(self, statement, params):
            self.calls += 1
            assert self.calls == 1, "No mutation is allowed before mapping validation"
            assert "ORDER BY id FOR UPDATE" in str(statement)
            return self
        def mappings(self):
            return self
        def all(self):
            return [source, replacement]
    connection = ReadOnlyConnection()
    with pytest.raises(RuntimeError):
        _reconcile_template(connection, source["id"], replacement["id"], uuid.uuid4(),
            "Reviewed test mapping", 100)
    assert connection.calls == 1


@pytest.mark.parametrize("case", ["retired", "deleted", "foreign", "missing"])
def test_invalid_replacement_parent_rejected_before_any_write(case):
    source, replacement = row(), row(category_id=uuid.uuid4())
    parent = dict(id=replacement["category_id"], organization_id=None, is_active=True, deleted_at=None)
    if case == "retired":
        parent["is_active"] = False
    elif case == "deleted":
        parent["deleted_at"] = "historical deletion"
    elif case == "foreign":
        parent["organization_id"] = uuid.uuid4()
    class GuardedConnection:
        def __init__(self):
            self.calls = 0
        def execute(self, statement, params):
            self.calls += 1
            assert self.calls <= 2, "No mutation is allowed for an invalid parent"
            assert "ORDER BY id FOR UPDATE" in str(statement)
            return self
        def mappings(self):
            return self
        def all(self):
            return [source, replacement] if self.calls == 1 else ([] if case == "missing" else [parent])
    connection = GuardedConnection()
    with pytest.raises(RuntimeError, match="category must be active"):
        _reconcile_template(connection, source["id"], replacement["id"], uuid.uuid4(),
            "Reviewed test mapping", 100)
    assert connection.calls == 2
