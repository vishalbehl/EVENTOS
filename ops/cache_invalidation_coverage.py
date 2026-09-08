"""Audit cache-matrix mutation coverage without changing application state."""
from __future__ import annotations

import argparse
import json
from pathlib import Path


def audit(root: Path) -> dict:
    matrix = root / "services" / "backend" / "app" / "core" / "cache_invalidation_matrix.py"
    source_root = root / "services" / "backend" / "app" / "modules"
    text = matrix.read_text(encoding="utf-8")
    domains: dict[str, list[str]] = {}
    for line in text.splitlines():
        if "CacheInvalidationRule(" not in line:
            continue
        parts = line.split("CacheInvalidationRule(", 1)[1].split(")", 1)[0]
        values = [item.strip().strip('"') for item in parts.split(",", 3)]
        if len(values) == 4:
            mutations = values[3].strip("()")
            domains[values[0]] = [item.strip().strip('"') for item in mutations.split(",") if item.strip()]
    files = list(source_root.rglob("*.py"))
    corpus = "\n".join(path.read_text(encoding="utf-8", errors="ignore") for path in files)
    rows = []
    for read_domain, mutation_domains in domains.items():
        matched = sorted({domain for domain in mutation_domains if domain in corpus})
        rows.append({
            "read_domain": read_domain,
            "mutation_domains": mutation_domains,
            "matched_source_tokens": matched,
            "unmatched_source_tokens": sorted(set(mutation_domains) - set(matched)),
        })
    return {
        "matrix_domains": len(rows),
        "source_files_scanned": len(files),
        "rows": rows,
        "all_tokens_present": all(not row["unmatched_source_tokens"] for row in rows),
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", type=Path, default=Path(__file__).resolve().parents[1])
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    report = audit(args.root)
    rendered = json.dumps(report, indent=2, sort_keys=True) + "\n"
    print(rendered, end="")
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(rendered, encoding="utf-8")
    return 0 if report["all_tokens_present"] else 2


if __name__ == "__main__":
    raise SystemExit(main())
