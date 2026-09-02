"""Low-cardinality Prometheus metrics for local and production-like monitoring."""
from prometheus_client import Counter, Gauge, Histogram

REQUESTS = Counter("confplatform_http_requests_total", "HTTP requests", ("method", "status_class"))
LATENCY = Histogram("confplatform_http_request_duration_seconds", "HTTP latency", ("method",))
DB_QUERIES = Histogram("confplatform_http_db_queries", "ORM statements per request", ("method",))
DB_TIME = Histogram("confplatform_http_db_time_seconds", "DB time per request", ("method",))
IN_FLIGHT = Gauge("confplatform_http_requests_in_flight", "Requests currently in flight")
DB_POOL_CHECKED_OUT = Gauge(
    "confplatform_db_pool_checked_out",
    "Connections currently checked out from the SQLAlchemy pool",
    ("engine",),
)
DB_POOL_PEAK_CHECKED_OUT = Gauge(
    "confplatform_db_pool_peak_checked_out",
    "Highest SQLAlchemy pool checkout level observed since process start",
    ("engine",),
)
DB_POOL_SIZE = Gauge("confplatform_db_pool_size", "Configured SQLAlchemy pool size", ("engine",))
DB_POOL_MAX_OVERFLOW = Gauge("confplatform_db_pool_max_overflow", "Configured SQLAlchemy maximum overflow", ("engine",))
DB_POOL_CHECKOUTS = Counter(
    "confplatform_db_pool_checkouts_total",
    "Successful SQLAlchemy pool checkouts",
    ("engine",),
)
DB_POOL_CHECKINS = Counter(
    "confplatform_db_pool_checkins_total",
    "SQLAlchemy pool checkins",
    ("engine",),
)
CACHE_OPERATIONS = Counter(
    "confplatform_cache_operations_total",
    "Application cache operations by operation and outcome",
    ("operation", "outcome"),
)
CACHE_LATENCY = Histogram(
    "confplatform_cache_operation_duration_seconds",
    "Application cache operation latency",
    ("operation",),
)
STORAGE_OPERATIONS = Counter(
    "confplatform_storage_operations_total",
    "S3-compatible and local storage operations by operation and outcome",
    ("operation", "outcome"),
)
STORAGE_LATENCY = Histogram(
    "confplatform_storage_operation_duration_seconds",
    "Storage operation latency",
    ("operation",),
)


def observe_cache(operation: str, outcome: str, duration_ms: float) -> None:
    """Export bounded cache telemetry without affecting the request path."""
    try:
        CACHE_OPERATIONS.labels(operation, outcome).inc()
        CACHE_LATENCY.labels(operation).observe(max(0.0, duration_ms) / 1000)
    except Exception:
        # Metrics must never affect cache availability.
        pass


def observe_storage(operation: str, outcome: str, duration_ms: float) -> None:
    """Export low-cardinality storage telemetry without affecting storage."""
    try:
        STORAGE_OPERATIONS.labels(operation, outcome).inc()
        STORAGE_LATENCY.labels(operation).observe(max(0.0, duration_ms) / 1000)
    except Exception:
        # Metrics must never turn an object-storage failure into an API failure.
        pass


def observe_pool_checkout(engine_name: str) -> None:
    try:
        current = DB_POOL_CHECKED_OUT.labels(engine_name)
        current.inc()
        peak = DB_POOL_PEAK_CHECKED_OUT.labels(engine_name)
        observed = float(current._value.get())  # prometheus-client child value
        if observed > float(peak._value.get()):
            peak.set(observed)
        DB_POOL_CHECKOUTS.labels(engine_name).inc()
    except Exception:
        pass


def observe_pool_checkin(engine_name: str) -> None:
    try:
        DB_POOL_CHECKED_OUT.labels(engine_name).dec()
        DB_POOL_CHECKINS.labels(engine_name).inc()
    except Exception:
        pass

def set_pool_capacity(engine_name: str, pool_size: int, max_overflow: int) -> None:
    """Publish pool capacity without making metrics part of DB availability."""
    try:
        DB_POOL_SIZE.labels(engine_name).set(max(0, pool_size))
        DB_POOL_MAX_OVERFLOW.labels(engine_name).set(max(0, max_overflow))
    except Exception:
        pass

def observe_request(method: str, _path: str, status: int, duration_ms: int, query_count: int, db_ms: float) -> None:
    try:
        REQUESTS.labels(method, f"{status // 100}xx").inc()
        LATENCY.labels(method).observe(duration_ms / 1000)
        DB_QUERIES.labels(method).observe(query_count)
        DB_TIME.labels(method).observe(db_ms / 1000)
    except Exception:
        # Metrics must never affect request handling.
        pass
