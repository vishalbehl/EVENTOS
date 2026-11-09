"""Versioned, bounded customer policy. Platform permissions never enter this catalogue.

Defaults apply to accepted memberships, never identity/global role labels. A
workspace role applies only after workspace ownership and binding are validated.
"""
from types import MappingProxyType

CATALOGUE_VERSION = 2
_families = {
    "EVENTS": ("VIEW", "CREATE", "EDIT", "DELETE", "EXPORT"),
    "SESSIONS": ("VIEW", "CREATE", "EDIT", "DELETE", "APPROVE", "OVERRIDE", "EXPORT"),
    "SPEAKERS": ("VIEW", "CREATE", "EDIT", "DELETE", "APPROVE", "EXPORT"),
    "FILES": ("VIEW", "CREATE", "EDIT", "DELETE", "APPROVE", "REJECT", "DOWNLOAD", "EXPORT"),
    "ROOMS": ("VIEW", "CREATE", "EDIT", "DELETE", "OVERRIDE"),
    "QUEUE": ("VIEW", "CREATE", "EDIT", "DELETE", "OVERRIDE"),
    "DEVICES": ("VIEW", "CREATE", "EDIT", "DELETE"),
    "POSTERS": ("VIEW", "CREATE", "EDIT", "DELETE", "APPROVE", "EXPORT"),
    "REPORTS": ("VIEW", "EXPORT"),
    "ANALYTICS": ("VIEW", "REG_DASHBOARD", "HUB", "EXPORT"),
    "PARTICIPANTS": ("VIEW", "CREATE", "EDIT", "DELETE", "IMPORT", "EXPORT"),
    "REGISTRATION": ("VIEW_QUEUE", "APPROVE", "REJECT", "WAITLIST", "OVERRIDE"),
    "REG_CONFIG": ("VIEW", "EDIT", "PRICING", "ROLES", "FORM", "FAQ"),
    "BADGES": ("VIEW", "GENERATE", "PRINT", "REPRINT", "TEMPLATES", "QUEUE", "EXPORT"),
    "CHECKIN": ("VIEW", "QR", "MANUAL", "UNDO", "LOGS"),
    "CAMPAIGNS": ("VIEW", "CREATE", "EDIT", "SEND", "DELETE", "TEMPLATES"),
    "ANNOUNCEMENTS": ("VIEW", "EDIT"),
    "PAYMENTS": ("VIEW", "MARK_PAID", "MARK_UNPAID", "REFUND", "PRICING"),
    "DEVELOPER": ("API_USE", "WEBHOOKS_MANAGE", "INTEGRATIONS_MANAGE"),
    "USERS": ("VIEW", "CREATE", "EDIT", "DELETE"),
}
OPERATIONAL_ACTIONS = frozenset(f"{family}:{action}" for family, actions in _families.items()
                              if family not in {"PAYMENTS", "DEVELOPER", "USERS"} for action in actions)
READ_ACTIONS = frozenset(code for code in OPERATIONAL_ACTIONS if code.split(":", 1)[1]
                        in {"VIEW", "VIEW_QUEUE", "REG_DASHBOARD", "HUB", "LOGS"})
BILLING_ACTIONS = frozenset({"billing:view", "billing:purchase", "billing:cancel", "billing:allocate",
                           "billing:transfer", *(f"PAYMENTS:{action}" for action in _families["PAYMENTS"])})
FOUNDATION_ACTIONS = frozenset({"organization:branding:manage", "workspace:view", "workspace:create", "workspace:edit", "workspace:archive",
                              "members:manage", "relationships:manage", "clients:provision",
                              "roles:view", "roles:manage", "teams:view", "teams:manage",
                              "workflows:view", "workflows:manage", "workflows:approve"})
CUSTOMER_ACTIONS = frozenset(f"{family}:{action}" for family, actions in _families.items() for action in actions) | FOUNDATION_ACTIONS | BILLING_ACTIONS

# Compatibility is deliberate and enumerated, not punctuation/case guesswork.
ALIASES = MappingProxyType({"WORKSPACES:VIEW": "workspace:view", "WORKSPACES:CREATE": "workspace:create",
    "WORKSPACES:EDIT": "workspace:edit", "WORKSPACES:ARCHIVE": "workspace:archive",
    "MEMBERS:MANAGE": "members:manage", "RELATIONSHIPS:MANAGE": "relationships:manage",
    "ROLES:VIEW": "roles:view", "ROLES:MANAGE": "roles:manage"})

def canonical_action(code: str) -> str | None:
    if not isinstance(code, str):
        return None
    code = ALIASES.get(code, code)
    return code if code in CUSTOMER_ACTIONS else None

_admin = (FOUNDATION_ACTIONS - {"clients:provision"}) | OPERATIONAL_ACTIONS
ORGANIZATION_ROLES = MappingProxyType({
    "owner": _admin | BILLING_ACTIONS,
    "admin": _admin | BILLING_ACTIONS,
    # Container visibility is not operational authority across all workspaces.
    "member": frozenset({"workspace:view"}),
    "viewer": frozenset({"workspace:view"}),
    "reviewer": frozenset({"workspace:view"}),
    "billing_only": BILLING_ACTIONS,
    "billing": BILLING_ACTIONS,
})
WORKSPACE_ROLES = MappingProxyType({
    "admin": OPERATIONAL_ACTIONS | {"workspace:view"},
    "member": READ_ACTIONS | {"EVENTS:EDIT", "SESSIONS:CREATE", "SESSIONS:EDIT", "SPEAKERS:CREATE",
                            "SPEAKERS:EDIT", "FILES:CREATE", "FILES:EDIT", "POSTERS:CREATE", "POSTERS:EDIT"},
    "viewer": READ_ACTIONS,
})

def organization_defaults(role: str, kind: str) -> frozenset[str]:
    actions = ORGANIZATION_ROLES.get(role, frozenset())
    return actions | {"clients:provision"} if role == "owner" and kind == "EMC" else actions
