import hashlib
import json

from app.node_replica import NodeReplica


def test_node_replica_persists_event_snapshot_and_deduplicates_outbox(tmp_path):
    replica = NodeReplica(tmp_path / "node.db")
    admin_row = replica.connection.execute("SELECT username,role,allowed_modes,password_hash FROM local_users WHERE username='admin'").fetchone()
    assert admin_row is None
    replica.ensure_default_admin("venue.admin", "test-password-with-strong-length", "venue.admin@example.test")
    admin_row = replica.connection.execute("SELECT username,role,allowed_modes,password_hash FROM local_users WHERE username='venue.admin'").fetchone()
    assert admin_row["role"] == "super_admin"
    assert json.loads(admin_row["allowed_modes"]) == ["admin"]
    assert admin_row["password_hash"].startswith("pbkdf2_sha256$")
    snapshot = {
        "event": {"id": "event-1"},
        "assignment": {"id": "node-1", "mode": "scanning", "capacity_rule_id": "rule-1"},
        "participants": [{"id": "participant-1", "regno": "DEL-1", "name": "Ada"}],
        "registrations": [],
        "companions": [{"id": "companion-1", "primary_participant_id": "participant-1", "first_name": "Grace", "last_name": "Hopper", "badge_code": "CMP-1"}],
        "badges": [{"id": "badge-1", "participant_id": "participant-1", "badge_code": "DEL-1"}],
        "capacity_rules": [{"id": "rule-1", "station_name": "Main Gate"}],
        "kits": [{"id": "kit-1", "kit_name": "Delegate Kit"}],
        "participant_kits": [{"id": "participant-kit-1", "participant_id": "participant-1", "kit_id": "kit-1"}],
        "venue_scan_events": [{"id": "scan-1", "event_id": "event-1", "participant_id": "participant-1", "companion_id": None, "checkin_gate_id": "rule-1", "status": "success"}],
        "venue_checkins": [{"id": "checkin-1", "event_id": "event-1", "participant_id": "participant-1", "companion_id": None, "checkin_gate_id": "rule-1", "status": "success"}],
    }
    snapshot["snapshot"] = {"version": 2, "sha256": hashlib.sha256(json.dumps(snapshot, sort_keys=True, separators=(",", ":")).encode()).hexdigest()}
    replica.load_snapshot(snapshot)
    assert replica.path.endswith("node.db")
    assert replica.identity_by_query("CMP-1")[1]["id"] == "companion-1"
    assert replica.capacity_rule("rule-1")["station_name"] == "Main Gate"
    assert replica.local_successful_checkin_count("participant-1", "rule-1") == 1
    operation_id = replica.queue_operation("check_in", {"participant_id": "participant-1"}, "operation-1")
    assert operation_id == "operation-1"
    replica.queue_operation("check_in", {"participant_id": "participant-1"}, "operation-1")
    assert len(replica.pending_operations()) == 1
    replica.mark_uploaded([operation_id])
    assert replica.pending_operations() == []
    replica.close()
