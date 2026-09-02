from __future__ import annotations

from typing import Protocol, TypeVar

ResultT = TypeVar("ResultT")


class CommandService(Protocol[ResultT]):
    """Mutation contract; implementation owns one transaction boundary."""

    async def execute(self, **command) -> ResultT: ...

