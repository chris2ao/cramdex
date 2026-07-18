"""LLM provider interface shared by every backend."""
from __future__ import annotations

from typing import AsyncIterator, Protocol, runtime_checkable


class LLMError(RuntimeError):
    """A provider could not produce a response."""


@runtime_checkable
class Provider(Protocol):
    name: str
    display_name: str

    def stream(self, system: str, user: str) -> AsyncIterator[str]:
        """Yield answer text chunks. Raises LLMError on failure."""
        ...

    async def complete(self, system: str, user: str) -> str:
        """Return the full completion text. Raises LLMError on failure."""
        ...

    def status(self) -> dict:
        """Report availability without making a network call."""
        ...
