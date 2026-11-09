"""Explicit whole-cohort orchestration of the existing operator tools.

Default report only. Does not grant memberships, guess classification/lifecycle,
change contracts or declare application acceptance. Authored, not executed.
"""
import argparse
import json
from pathlib import Path
import subprocess
import sys
import uuid

DIRECTORY = Path(__file__).parent
BLOCKING_COUNTS = (
    "events_foreign_workspace", "invalid_accepted_memberships", "users_without_accepted_membership",
    "relationship_kind_conflicts", "duplicate_managing_relationships", "invalid_event_assignments",
    "classification_conflicts", "legacy_lifecycle_conflicts", "unexplained_event_assignments",
    "missing_relationship_consent",
)


def load_cohort(path):
    path = Path(path)
    if path.stat().st_size > 1024 * 1024:
        raise ValueError("Cohort document exceeds 1 MiB")
    rows = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(rows, list) or not 1 <= len(rows) <= 1000:
        raise ValueError("Use 1-1000 explicitly approved customer organisations")
    parsed = []
    for row in rows:
        if not isinstance(row, dict) or set(row) != {"organization_id", "confirmed_kind"} or row["confirmed_kind"] not in {"NORMAL", "EMC", "CLIENT"}:
            raise ValueError("Each cohort row requires only organization_id and confirmed_kind")
        parsed.append({"organization_id": str(uuid.UUID(row["organization_id"])), "confirmed_kind": row["confirmed_kind"]})
    if len({row["organization_id"] for row in parsed}) != len(parsed):
        raise ValueError("Duplicate cohort organisations")
    return sorted(parsed, key=lambda row: row["organization_id"])


def run_tool(name, arguments):
    # Credentials stay in the existing operator environment, never argv/output.
    try:
        result = subprocess.run([sys.executable, str(DIRECTORY / name), *arguments], capture_output=True, text=True, timeout=3600)
    except (OSError, subprocess.TimeoutExpired):
        return {"status": "OPERATOR_TOOL_FAILED", "raw_output_redacted": True}
    try:
        payload = json.loads(result.stdout)
    except (ValueError, TypeError):
        return {"status": "OPERATOR_TOOL_FAILED", "exit_code": result.returncode, "raw_output_redacted": True}
    if not isinstance(payload, dict):
        return {"status": "OPERATOR_TOOL_FAILED", "raw_output_redacted": True}
    # A reconciliation report uses exit 2 for quarantine (including ownership
    # rows awaiting backfill). Never accept a success-shaped payload after a
    # failed process, or ignore an unexpected nonzero operator exit.
    expected_exit = 2 if payload.get("status") == "QUARANTINED" else 0
    if result.returncode != expected_exit:
        return {"status": "OPERATOR_TOOL_FAILED", "exit_code": result.returncode, "raw_output_redacted": True}
    return payload


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--cohort", required=True)
    parser.add_argument("--actor", required=True, type=uuid.UUID)
    parser.add_argument("--approval-reference", required=True)
    parser.add_argument("--build-id", required=True)
    parser.add_argument("--stage", choices=("report", "backfill", "validate"), default="report")
    parser.add_argument("--output", type=Path, help="Create a new evidence file; never overwrite existing evidence")
    args = parser.parse_args()
    if not 12 <= len(args.approval_reference.strip()) <= 200 or not 7 <= len(args.build_id.strip()) <= 128:
        parser.error("Approval reference/build identity are required")
    if args.output:
        # Reserve evidence before any operator command. A collision or invalid
        # destination must fail before a backfill/validation can change state.
        with args.output.open("x", encoding="utf-8") as artifact:
            return execute_stage(args, artifact)
    return execute_stage(args)


def execute_stage(args, artifact=None):
    cohort = load_cohort(args.cohort)
    def emit(evidence):
        if artifact is not None:
            json.dump(evidence, artifact, indent=2)
            artifact.flush()
        print(json.dumps(evidence))
    common = ["--actor", str(args.actor), "--approval-reference", args.approval_reference]
    evidence = {"build_id": args.build_id, "run_id": str(uuid.uuid4()), "stage": args.stage,
        "application_acceptance": "NOT_RUN", "report": [], "backfill": [], "validation": None}
    # ALL cohort reports precede ANY writes. Unexplained access quarantines the
    # entire selected release cohort, not just the first tenant encountered.
    for row in cohort:
        report = run_tool("category_a_phase1_reconcile.py", common + ["--organization", row["organization_id"], "--confirmed-kind", row["confirmed_kind"]])
        evidence["report"].append(report)
    def unresolved(report):
        counts = report.get("after")
        return (report.get("status") not in {"QUARANTINED", "RECONCILED_SOURCE_OWNERSHIP"}
            or not isinstance(counts, dict) or any(counts.get(key, 1) for key in BLOCKING_COUNTS)
            or counts.get("accepted_active_owners", 0) == 0)
    if any(unresolved(report) for report in evidence["report"]):
        evidence["status"] = "QUARANTINED_COHORT"
        emit(evidence); return 2
    if args.stage == "backfill":
        for row in cohort:
            result = run_tool("category_a_phase1_reconcile.py", common + ["--organization", row["organization_id"],
                "--confirmed-kind", row["confirmed_kind"], "--apply-ownership-backfill"])
            evidence["backfill"].append(result)
            if result.get("status") != "RECONCILED_SOURCE_OWNERSHIP":
                evidence["status"] = "BACKFILL_INTERRUPTED_RESUMABLE"
                emit(evidence); return 2
    if args.stage == "validate":
        arguments = common + ["--build-id", args.build_id, "--execute"]
        for row in cohort:
            arguments.extend(["--organization", row["organization_id"]])
        evidence["validation"] = run_tool("category_a_phase1_validate.py", arguments)
        if evidence["validation"].get("status") != "CONSTRAINTS_VALIDATED":
            evidence["status"] = "VALIDATION_BLOCKED"
            emit(evidence); return 2
    evidence["status"] = "OPERATOR_STAGE_COMPLETE_NOT_RELEASED"
    emit(evidence); return 0


if __name__ == "__main__":
    raise SystemExit(main())
