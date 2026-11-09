"""Finite render/transport budgets; oversized content is rejected, never truncated."""
from fastapi import HTTPException

TEMPLATE_BYTES = 1024 * 1024
RENDERED_BYTES = 8 * 1024 * 1024
VARIABLE_BYTES = 1024 * 1024
VARIABLE_TOTAL_BYTES = 4 * 1024 * 1024
INLINE_IMAGE_BYTES = 2 * 1024 * 1024
INLINE_TOTAL_BYTES = 4 * 1024 * 1024
INLINE_IMAGE_COUNT = 16


def byte_size(value: str, maximum: int) -> int:
    # Cheap character bound first avoids encoding an arbitrarily large DB string.
    if not isinstance(value, str) or len(value) > maximum:
        raise HTTPException(422, detail={"code": "EMAIL_RESOURCE_LIMIT_EXCEEDED"})
    size = len(value.encode("utf-8"))
    if size > maximum:
        raise HTTPException(422, detail={"code": "EMAIL_RESOURCE_LIMIT_EXCEEDED"})
    return size


def bounded_substitute(pattern, replace, source, maximum=RENDERED_BYTES):
    pieces = []
    total = 0
    start = 0
    for index, match in enumerate(pattern.finditer(source)):
        if index >= 2_000:
            raise HTTPException(422, detail={"code": "EMAIL_RESOURCE_LIMIT_EXCEEDED"})
        for piece in (source[start:match.start()], replace(match)):
            total += byte_size(piece, maximum)
            if total > maximum:
                raise HTTPException(422, detail={"code": "EMAIL_RESOURCE_LIMIT_EXCEEDED"})
            pieces.append(piece)
        start = match.end()
    suffix = source[start:]
    total += byte_size(suffix, maximum)
    if total > maximum:
        raise HTTPException(422, detail={"code": "EMAIL_RESOURCE_LIMIT_EXCEEDED"})
    pieces.append(suffix)
    return "".join(pieces)
