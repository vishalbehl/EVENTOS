"""Single bounded rate-policy registry; compatibility aliases share family buckets."""
from dataclasses import dataclass, field
from types import MappingProxyType
from app.config import settings
from app.core.endpoint_contracts import endpoint_contract, endpoint_inventory


@dataclass(frozen=True, slots=True)
class RatePolicy:
    family: str
    capacity: int
    window: int
    burst: int

    def __post_init__(self):
        if (not self.family or len(self.family) > 80 or type(self.capacity) is not int or
                type(self.window) is not int or type(self.burst) is not int or
                not 1 <= self.capacity <= 10_000_000 or not 1 <= self.window <= 86400 or
                not 1 <= self.burst <= self.capacity):
            raise ValueError("Invalid registered rate policy")


POLICIES = MappingProxyType({name: RatePolicy(name, capacity, window, burst) for name, capacity, window, burst in (
    ("login", 30, 300, 30), ("invite-accept", 10, 600, 10), ("refresh", 60, 60, 20),
    ("identity", 30, 300, 10), ("recovery", 20, 3600, 5), ("context", 30, 60, 10),
    ("mfa", 5, 300, 5), ("invitations", 20, 3600, 10),
    ("access-administration", 10, 600, 10), ("payment", 10, 600, 5),
    ("exports", 5, 3600, 5), ("uploads", 30, 60, 10),
    ("reads", 120, 60, 30), ("writes", 60, 60, 10),
    ("machine", 600, 60, 100), ("provider", 600, 60, 100),
)})


def template_policy(path: str, method: str) -> RatePolicy:
    """Compatibility inventory adapter, run on registered templates at startup.

    It is not an authorization decision. Explicit operation registrations should
    replace legacy classification as endpoint ownership/audience work proceeds.
    """
    prefix = settings.api_v1_prefix.rstrip("/")
    path = path[len(prefix):] if path.startswith(prefix + "/") else path
    pieces = tuple(part for part in path.split("/") if part)
    write = method not in {"GET", "HEAD", "OPTIONS"}
    if pieces[:1] == ("auth",):
        if pieces[-1:] == ("login",):
            return POLICIES["login"]
        if pieces[-1:] in {("accept-invite",), ("invitation",)}:
            return POLICIES["invite-accept"]
        if any(part in {"forgot-password", "reset-password", "recovery"} for part in pieces):
            return POLICIES["recovery"]
        if pieces[-1:] == ("refresh",):
            return POLICIES["refresh"]
        return POLICIES["identity"]
    if any(part in {"mfa", "2fa"} for part in pieces):
        return POLICIES["mfa"]
    if pieces[:1] == ("access",) and write:
        return POLICIES["context"]
    if any(part in {"invitations", "invite", "resend"} for part in pieces) and write:
        return POLICIES["invitations"]
    if write and any(part in {"members", "members-bulk", "roles", "teams", "client-relationships", "workspaces"} for part in pieces):
        return POLICIES["access-administration"]
    if write and any(part in {"checkout", "pay", "payment"} for part in pieces):
        return POLICIES["payment"]
    if any(part in {"export", "exports"} for part in pieces):
        return POLICIES["exports"]
    if any(part in {"upload", "uploads"} for part in pieces):
        return POLICIES["uploads"]
    return POLICIES["writes" if write else "reads"]


@dataclass(slots=True)
class _Node:
    literals: dict = field(default_factory=dict)
    parameter: object = None
    operations: dict = field(default_factory=dict)


@dataclass(frozen=True, slots=True)
class RegisteredRateOperation:
    operation_id: str
    policy: RatePolicy
    body_limit: int | None = None
    access_contract: object = None


class RatePolicyRegistry:
    def __init__(self):
        self.root = _Node()

    def register(self, path, method, operation_id, policy, body_limit=None, access_contract=None):
        if policy.family not in POLICIES or not operation_id or len(operation_id) > 300:
            raise ValueError("Invalid registered rate operation")
        if body_limit is not None and (type(body_limit) is not int or not 1 <= body_limit <= 1024 * 1024):
            raise ValueError("Invalid registered foundation body limit")
        node = self.root
        for part in path.strip("/").split("/"):
            if part.startswith("{") and part.endswith("}"):
                if ":path" in part:
                    # Catch-all routes need explicit edge/application policies;
                    # do not allow them to manufacture arbitrary bucket names.
                    return
                if node.parameter is None:
                    node.parameter = _Node()
                node = node.parameter
            else:
                node = node.literals.setdefault(part, _Node())
        previous = node.operations.get(method)
        operation = RegisteredRateOperation(operation_id, policy, body_limit, access_contract)
        if previous is not None and previous != operation:
            raise ValueError("Conflicting registered rate operation")
        node.operations[method] = operation

    def resolve(self, path, method):
        if len(path) > 8192:
            return None
        parts = path.strip("/").split("/")
        if len(parts) > 64:
            return None
        # Static branches take precedence. Backtracking is bounded by the
        # finite registered tree, not by arbitrary client-supplied segments.
        def visit(node, index):
            if index == len(parts):
                return node.operations.get(method)
            literal = node.literals.get(parts[index])
            found = visit(literal, index + 1) if literal is not None else None
            return found or (visit(node.parameter, index + 1) if node.parameter is not None else None)
        return visit(self.root, 0)


def template_body_limit(path, policy):
    """Inventory adapter for small JSON/credential operations, never uploads.

    Resolve once from registered templates; raw paths cannot choose a weaker
    limit. Explicit resource metadata will replace this legacy adapter.
    """
    prefix = settings.api_v1_prefix.rstrip("/")
    path = path[len(prefix):] if path.startswith(prefix + "/") else path
    pieces = tuple(part for part in path.split("/") if part)
    if pieces[:1] == ("auth",) or policy.family in {"login", "mfa", "refresh", "identity", "recovery", "invite-accept"}:
        return 16 * 1024
    if policy.family == "uploads":
        return None
    if policy.family in {"access-administration", "invitations", "context"} or pieces[:1] in {
        ("access",), ("organizations",), ("rbac",),
    } or pieces[:2] in {("emc", "client-relationships"), ("platform", "organizations")}:
        return 1024 * 1024
    return None


def bind_rate_operations(app):
    registry = RatePolicyRegistry()
    registrations = []
    policies = {}
    body_limits = {}
    access_contracts = {}
    priority = {family: index for index, family in enumerate(("reads", "writes", "uploads", "exports",
        "payment", "context", "identity", "refresh", "access-administration", "invitations", "recovery", "mfa", "invite-accept", "login"))}
    for route in app.routes:
        if not getattr(route, "methods", None):
            continue
        endpoint = getattr(route, "endpoint", None)
        operation_id = getattr(route, "operation_id", None) or (
            f"{endpoint.__module__}.{endpoint.__qualname__}" if endpoint is not None else route.name)
        for method in route.methods:
            contract = endpoint_contract(endpoint, method)
            policy = POLICIES[contract.rate_family] if contract is not None else template_policy(route.path, method)
            key = (operation_id, method)
            if contract is not None:
                previous_contract = access_contracts.get(key)
                if previous_contract is not None and previous_contract != contract:
                    raise ValueError("Conflicting protected endpoint alias contract")
                access_contracts[key] = contract
            limit = contract.body_limit if contract is not None else template_body_limit(route.path, policy)
            if limit is not None:
                body_limits[key] = min(limit, body_limits.get(key, limit))
            previous = policies.get(key)
            if previous is None or priority.get(policy.family, 0) > priority.get(previous.family, 0):
                policies[key] = policy
            registrations.append((route.path, method, operation_id))
    seen = set()
    for path, method, operation_id in registrations:
        # Match Starlette's first registered handler for duplicate templates.
        # The full endpoint inventory still reports such duplicates separately.
        normalized = "/".join("{}" if part.startswith("{") else part for part in path.split("/"))
        if (normalized, method) in seen:
            continue
        seen.add((normalized, method))
        registry.register(path, method, operation_id, policies[(operation_id, method)],
            body_limits.get((operation_id, method)), access_contracts.get((operation_id, method)))
    app.state.rate_policy_registry = registry
    app.state.endpoint_contract_inventory = endpoint_inventory(app)


def request_operation(request):
    registry = None
    try:
        registry = getattr(request.app.state, "rate_policy_registry", None)
    except (KeyError, AttributeError):
        pass
    method = request.scope.get("method", "POST")
    path = request.scope.get("path") or getattr(getattr(request, "url", None), "path", "")
    operation = registry.resolve(path, method) if registry is not None else None
    if operation is not None:
        return operation
    # Unknown routes never create URL-derived Redis keys. They still receive
    # broad ingress / ordinary budgets, with no privilege-based exemption.
    policy = template_policy(path, method)
    body_limit = template_body_limit(path, policy)
    return RegisteredRateOperation("unregistered", policy, body_limit)
