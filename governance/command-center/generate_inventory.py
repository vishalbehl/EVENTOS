"""Generate the Command Center Phase 0 route inventory from repository sources."""

from __future__ import annotations

import csv
import re
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
APP_ROOT = ROOT / "apps" / "cloud" / "command-center"
ROUTES_ROOT = APP_ROOT / "app"
OUTPUT = Path(__file__).with_name("COMMAND_CENTER_FEATURE_MATRIX.csv")
BACKEND_OUTPUT = Path(__file__).with_name("BACKEND_CAPABILITY_INVENTORY.csv")

MOCK_PATTERN = re.compile(
    r"\b(mock(?:ed)?|placeholder|coming soon|not implemented|fake success|static data)\b",
    re.IGNORECASE,
)
API_PATTERN = re.compile(r"[\"'`](\/api\/[^\"'`\s${}]*)")
HOOK_PATTERN = re.compile(r"\b(use[A-Z][A-Za-z0-9_]*)\b")
ROUTE_DECORATOR_PATTERN = re.compile(
    r"@(?P<router>[A-Za-z_][A-Za-z0-9_]*)\.(?P<method>get|post|put|patch|delete)"
    r"\(\s*[\"'](?P<path>[^\"']*)[\"']",
    re.IGNORECASE,
)

DOMAIN_RULES = (
    ("/dashboard", "analytics/platform", "operational projections", "platform.analytics.read"),
    ("/organizations", "platform/RBAC/billing", "organization and related tenant records", "organizations.read"),
    ("/business/subscription", "billing", "subscription, grant, activation and snapshot records", "billing.manage"),
    ("/business/pricing", "pricing/commercial/procurement", "catalogue and versioned pricing snapshots", "pricing.manage"),
    ("/business/sales", "commercial", "service request, quote and proposal records", "sales.manage"),
    ("/business", "commercial/analytics", "commercial projections and records", "commercial.read"),
    ("/finance", "billing/payments", "financial ledger and verified provider events", "finance.manage"),
    ("/operations-center", "operations/files/jobs", "durable operational records", "operations.manage"),
    ("/identity-security", "identity/RBAC/audit", "identity, assignment, session and audit records", "security.manage"),
    ("/developer-platform", "developer/notifications", "API client, webhook and integration records", "developer.manage"),
    ("/ai-workspace", "AI/workflow", "model, prompt, agent and run records", "ai.manage"),
    ("/support-center", "support/notifications", "ticket, knowledge and announcement records", "support.manage"),
    ("/applications", "platform/deployments", "application and release registry", "applications.manage"),
    ("/platform-settings", "platform/identity", "versioned platform configuration", "platform.settings.manage"),
    ("/super-admin/builder", "website_builder", "versioned site and publication records", "builder.manage"),
    ("/super-admin/platform", "templates/blueprints/theme_engine/marketplace", "versioned platform catalogues", "platform.catalogue.manage"),
    ("/super-admin/commercial", "billing/commercial", "commercial catalogue records", "billing.manage"),
)


def route_for(page: Path) -> str:
    parts: list[str] = []
    for part in page.relative_to(ROUTES_ROOT).parent.parts:
        if part.startswith("(") and part.endswith(")"):
            continue
        parts.append(part)
    return "/" + "/".join(parts) if parts else "/"


def phase_for(route: str) -> str:
    mappings = (
        (("/identity-security",), "3/8"),
        (("/support-center/announcements",), "3/7"),
        (("/business", "/finance"), "4"),
        (("/operations-center",), "5"),
        (("/developer-platform",), "6"),
        (("/support-center", "/ai-workspace", "/applications"), "7"),
        (("/platform-settings",), "8"),
        (("/super-admin",), "9"),
    )
    for prefixes, phase in mappings:
        if route.startswith(prefixes):
            return phase
    return "1/3"


def purpose_for(route: str) -> str:
    if route == "/":
        return "Super Admin authentication entry"
    segments = [s for s in route.split("/") if s and not s.startswith("[")]
    label = " ".join(segment.replace("-", " ") for segment in segments[-2:])
    return label.title() or "Command Center"


def domain_contract(route: str) -> tuple[str, str, str]:
    for prefix, owner, source, permission in DOMAIN_RULES:
        if route.startswith(prefix):
            return owner, source, permission
    if route == "/":
        return "identity", "identity and session ledger", "public.login"
    return "platform", "platform-owned record", "platform.read"


def requires_step_up(route: str) -> str:
    high_risk = ("impersonation", "authentication", "permissions", "roles", "payments", "api-keys")
    return "REQUIRED_FOR_HIGH_RISK_MUTATIONS" if any(value in route for value in high_risk) else "POLICY_DRIVEN"


def job_contract(route: str) -> str:
    asynchronous = ("exports", "deployments", "jobs", "storage", "search", "analytics", "automation", "preview")
    return "DURABLE_JOB_REQUIRED" if any(value in route for value in asynchronous) else "NONE_OR_DOMAIN_REVIEW"


def maturity_for(text: str) -> tuple[str, str]:
    findings = sorted({match.group(0).lower() for match in MOCK_PATTERN.finditer(text)})
    if findings:
        return "MOCKED", "; ".join(findings)
    if "useQuery" in text or "useMutation" in text or re.search(r"\buse[A-Z]\w+\(", text):
        return "PARTIAL", "Requires contract and journey verification"
    return "PARTIAL", "No explicit data-hook integration detected"


def build_frontend_rows() -> list[dict[str, str]]:
    rows: list[dict[str, str]] = []
    for page in sorted(ROUTES_ROOT.rglob("page.tsx")):
        text = page.read_text(encoding="utf-8", errors="replace")
        route = route_for(page)
        status, findings = maturity_for(text)
        owner, source, permission = domain_contract(route)
        apis = sorted(set(API_PATTERN.findall(text)))
        hooks = sorted(set(HOOK_PATTERN.findall(text)))
        dynamic = any(part.startswith("[") for part in page.parts)
        rows.append(
            {
                "route": route,
                "page_file": page.relative_to(ROOT).as_posix(),
                "purpose": purpose_for(route),
                "journey_type": "Detail" if dynamic else "Collection/Workspace",
                "current_status": status,
                "implementation_phase": phase_for(route),
                "frontend_integrations": "; ".join(hooks[:12]) or "NONE_DETECTED",
                "direct_api_references": "; ".join(apis) or "SERVICE_OR_HOOK_REVIEW_REQUIRED",
                "backend_owner": owner,
                "database_source": source,
                "permission": permission,
                "step_up": requires_step_up(route),
                "background_jobs": job_contract(route),
                "known_findings": findings,
                "ui_states": "REQUIRES_VERIFICATION",
                "accessibility": "REQUIRES_WCAG_REVIEW",
                "responsive": "REQUIRES_BREAKPOINT_REVIEW",
                "tests": "MISSING_OR_UNVERIFIED",
                "acceptance_owner": "Engineering Owner",
                "acceptance_evidence": "PENDING",
            }
        )
    return rows


def build_backend_rows() -> list[dict[str, str]]:
    backend_root = ROOT / "services" / "backend" / "app"
    rows: list[dict[str, str]] = []
    for source in sorted(backend_root.rglob("*.py")):
        if "tests" in source.parts or "alembic" in source.parts:
            continue
        text = source.read_text(encoding="utf-8", errors="replace")
        for match in ROUTE_DECORATOR_PATTERN.finditer(text):
            module = source.relative_to(backend_root).as_posix()
            rows.append(
                {
                    "method": match.group("method").upper(),
                    "declared_path": match.group("path") or "/",
                    "router_symbol": match.group("router"),
                    "backend_module": module,
                    "command_center_mapping": "REQUIRES_ROUTE_MAPPING",
                    "authorization_evidence": "REQUIRES_VERIFICATION",
                    "test_evidence": "REQUIRES_VERIFICATION",
                }
            )
    return rows


def render_csv(rows: list[dict[str, str]]) -> str:
    from io import StringIO

    stream = StringIO(newline="")
    fieldnames = list(rows[0]) if rows else []
    writer = csv.DictWriter(stream, fieldnames=fieldnames, lineterminator="\n")
    writer.writeheader()
    writer.writerows(rows)
    return stream.getvalue()


def write_or_check(path: Path, content: str, check: bool) -> bool:
    if check:
        return path.exists() and path.read_text(encoding="utf-8") == content
    path.write_text(content, encoding="utf-8", newline="")
    return True


def main() -> None:
    check = "--check" in sys.argv
    rows = build_frontend_rows()
    backend_rows = build_backend_rows()
    outputs = (
        (OUTPUT, render_csv(rows)),
        (BACKEND_OUTPUT, render_csv(backend_rows)),
    )

    stale = [path for path, content in outputs if not write_or_check(path, content, check)]
    if stale:
        print("Stale generated inventories:")
        for path in stale:
            print(f"- {path}")
        raise SystemExit(1)

    action = "Verified" if check else "Generated"
    print(f"{action} {len(rows)} frontend routes and {len(backend_rows)} backend endpoints")


if __name__ == "__main__":
    main()
