"""Bound registered foundation/credential bodies before authentication/parsing."""
import asyncio
import uuid

from starlette.requests import Request
from starlette.responses import JSONResponse

from app.core.rate_policy import request_operation


def body_error(status, code, message):
    correlation = str(uuid.uuid4())
    return JSONResponse({"detail": {"code": code, "message": message,
        "correlation_id": correlation, "retryable": False}}, status_code=status,
        headers={"Cache-Control": "no-store", "X-Correlation-ID": correlation})


class AccessBodyLimitMiddleware:
    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        operation = request_operation(Request(scope))
        limit = operation.body_limit
        if limit is None:
            await self.app(scope, receive, send)
            return
        lengths = [value for name, value in scope.get("headers", ()) if name.lower() == b"content-length"]
        transfer = [value for name, value in scope.get("headers", ()) if name.lower() == b"transfer-encoding"]
        if len(lengths) > 1 or (lengths and transfer):
            await body_error(400, "AMBIGUOUS_REQUEST_FRAMING", "Request body headers are ambiguous.")(scope, receive, send)
            return
        if lengths:
            value = lengths[0].strip()
            if not value or any(byte < 48 or byte > 57 for byte in value):
                await body_error(400, "INVALID_CONTENT_LENGTH", "Request body size is invalid.")(scope, receive, send)
                return
            if len(value) > 20 or int(value) > limit:
                await body_error(413, "REQUEST_TOO_LARGE", "This form exceeds the allowed request size. Reduce its contents and submit again.")(scope, receive, send)
                return
        # One bounded buffer prevents parsers swallowing receive exceptions.
        # No per-chunk full-body copies: O(total bytes), bounded memory.
        body = bytearray()
        deadline = asyncio.get_running_loop().time() + (10 if limit <= 16 * 1024 else 30)
        frames = 0
        while True:
            remaining = deadline - asyncio.get_running_loop().time()
            if remaining <= 0:
                await body_error(408, "REQUEST_BODY_TIMEOUT", "The request took too long to arrive. Your form was not submitted.")(scope, receive, send)
                return
            try:
                message = await asyncio.wait_for(receive(), timeout=remaining)
            except TimeoutError:
                await body_error(408, "REQUEST_BODY_TIMEOUT", "The request took too long to arrive. Your form was not submitted.")(scope, receive, send)
                return
            if message["type"] == "http.disconnect":
                return
            if message["type"] != "http.request":
                await body_error(400, "INVALID_BODY_STREAM", "Request body could not be read.")(scope, receive, send)
                return
            frames += 1
            if frames > 8192:
                await body_error(413, "REQUEST_BODY_FRAGMENTED", "Request body contains too many fragments.")(scope, receive, send)
                return
            chunk = message.get("body", b"")
            if len(body) + len(chunk) > limit:
                await body_error(413, "REQUEST_TOO_LARGE", "This form exceeds the allowed request size. Reduce its contents and submit again.")(scope, receive, send)
                return
            body.extend(chunk)
            if not message.get("more_body", False):
                break
        if lengths and len(body) != int(lengths[0].strip()):
            await body_error(400, "CONTENT_LENGTH_MISMATCH", "Request body size does not match its headers.")(scope, receive, send)
            return
        delivered = False

        async def bounded_receive():
            nonlocal delivered
            if not delivered:
                delivered = True
                return {"type": "http.request", "body": bytes(body), "more_body": False}
            return await receive()

        await self.app(scope, bounded_receive, send)
