from __future__ import annotations

from typing import Protocol, TypeVar

ResultT = TypeVar("ResultT")


class QueryService(Protocol[ResultT]):
    """Read-only screen/application query contract. Implementations never commit."""

    async def execute(self, **filters) -> ResultT: ...

