"""Anthropic API provider (official anthropic SDK, AsyncAnthropic)."""
from __future__ import annotations

from typing import AsyncIterator

import config
from llm.base import LLMError

# 8192: quiz generation (quiz.generate) asks for up to 10 scenario-based
# questions per call and needs the extra headroom; 2048 truncated longer
# decks mid-JSON.
MAX_TOKENS = 8192


class AnthropicProvider:
    """Talks to the Anthropic Messages API through the official SDK."""

    name = "anthropic_api"
    display_name = "Anthropic API"

    def __init__(self, cfg: config.LlmConfig):
        self._cfg = cfg
        self._model = cfg.model or config.DEFAULT_ANTHROPIC_MODEL

    def status(self) -> dict:
        # Never imports the SDK: status must be checkable without it installed.
        ok = bool(self._cfg.api_key)
        return {
            "name": self.name,
            "display_name": self.display_name,
            "configured": ok,
            "detail": (f"model {self._model}" if ok
                       else "set ANTHROPIC_API_KEY to enable"),
        }

    def _client(self):
        try:
            from anthropic import AsyncAnthropic
        except ImportError as exc:
            raise LLMError("The 'anthropic' package is not installed.") from exc
        if not self._cfg.api_key:
            raise LLMError("ANTHROPIC_API_KEY is not set.")
        return AsyncAnthropic(api_key=self._cfg.api_key)

    async def stream(self, system: str, user: str) -> AsyncIterator[str]:
        # Client construction happens inside the try block (via _client()) so
        # SDK errors raised at construction time are wrapped the same as
        # errors raised while streaming. `async with client:` closes the
        # underlying transport deterministically on every exit path: normal
        # completion, a mid-stream APIError, or an early consumer stop.
        # GeneratorExit (early consumer stop) is a BaseException, not an
        # Exception, so it is never caught by the except clauses below; it
        # still unwinds through both `async with` blocks, so the client is
        # closed even then.
        try:
            import anthropic
            client = self._client()
            async with client:
                # Extended thinking is deliberately left off here: it adds
                # latency to every Ask/quiz round trip for a study app where
                # answers should feel instant. Adaptive thinking (only
                # enabling it for harder questions) is a future option.
                async with client.messages.stream(
                    model=self._model, max_tokens=MAX_TOKENS, system=system,
                    messages=[{"role": "user", "content": user}],
                ) as stream:
                    async for text in stream.text_stream:
                        yield text
        except ImportError as exc:
            raise LLMError("The 'anthropic' package is not installed.") from exc
        except anthropic.APIError as exc:
            raise LLMError(f"Anthropic API error: {exc}") from exc

    async def complete(self, system: str, user: str) -> str:
        try:
            import anthropic
            client = self._client()
            async with client:
                # See stream()'s comment above: thinking is left off for
                # latency here too.
                resp = await client.messages.create(
                    model=self._model, max_tokens=MAX_TOKENS, system=system,
                    messages=[{"role": "user", "content": user}],
                )
        except ImportError as exc:
            raise LLMError("The 'anthropic' package is not installed.") from exc
        except anthropic.APIError as exc:
            raise LLMError(f"Anthropic API error: {exc}") from exc
        return "".join(
            block.text for block in resp.content
            if getattr(block, "type", "") == "text")
