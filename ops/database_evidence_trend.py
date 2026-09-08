"""Compare two sanitized database-evidence snapshots without exposing SQL values."""
from __future__ import annotations

import argparse
import json
from datetime import datetime, timezone
from pathlib import Path


def compare(before: dict, after: dict) -> dict:
    def by_fingerprint(report: dict) -> dict[str, dict]:
        source = report.get("top_application_queries") or report.get("sanitized_top_application_queries") or []
        return {
            str(row["fingerprint"]): row
            for row in source
            if row.get("fingerprint")
        }

    old = by_fingerprint(before)
    new = by_fingerprint(after)
    rows = []
    for fingerprint in sorted(set(old) | set(new)):
        previous, current = old.get(fingerprint, {}), new.get(fingerprint, {})
        old_calls, new_calls = previous.get("calls"), current.get("calls")
        old_total, new_total = previous.get("total_ms"), current.get("total_ms")
        rows.append({
            "fingerprint": fingerprint,
            "before_calls": old_calls,
            "after_calls": new_calls,
            "calls_delta": (new_calls - old_calls) if isinstance(old_calls, int) and isinstance(new_calls, int) else None,
            "before_total_ms": old_total,
            "after_total_ms": new_total,
            "total_ms_delta": round(new_total - old_total, 2) if isinstance(old_total, (int, float)) and isinstance(new_total, (int, float)) else None,
        })
    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "before_generated_at": before.get("generated_at"),
        "after_generated_at": after.get("generated_at"),
        "pg_stat_statements_available": bool(after.get("pg_stat_statements", {}).get("available")),
        "fingerprints": rows,
        "parameters_or_tenant_values_included": False,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("before", type=Path)
    parser.add_argument("after", type=Path)
    parser.add_argument("--output", type=Path, default=None)
    args = parser.parse_args()
    result = json.dumps(compare(json.loads(args.before.read_text()), json.loads(args.after.read_text())), indent=2) + "\n"
    if args.output:
        args.output.write_text(result, encoding="utf-8")
    print(result, end="")


if __name__ == "__main__":
    main()
