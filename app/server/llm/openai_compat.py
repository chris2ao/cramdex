"""OpenAI-compatible provider (plain httpx; targets OpenAI, Ollama, LM Studio, vLLM).

Deliberately does NOT use the `anthropic` SDK. POSTs to
`{base_url}/chat/completions` using the OpenAI chat-completions wire format,
so it works against any server implementing that API surface.
"""
from __future__ import annotations

import json
from typing import AsyncIterator, Callable

import httpx

import config
from llm.base import LLMError

DEFAULT_MODEL = "gpt-4o-mini"
TIMEOUT = httpx.Timeout(180.0)
BODY_SNIPPET_LIMIT = 200


def _body_snippet(text: str) -> str:
    text = text.strip()
    return text[:BODY_SNIPPET_LIMIT]


class OpenAICompatProvider:
    """Talks to an OpenAI-compatible `/chat/completions` endpoint via httpx."""

    name = "openai_compatible"
    display_name = "OpenAI-compatible"

    def __init__(self, cfg: config.LlmConfig,
                 client_factory: Callable[..., httpx.AsyncClient] = httpx.AsyncClient):
        self._cfg = cfg
        self._model = cfg.model or DEFAULT_MODEL
        self._client_factory = client_factory

    def status(self) -> dict:
        # No network calls: a base_url is required, an API key is optional
        # (many local servers such as Ollama/LM Studio need none).
        ok = bool(self._cfg.base_url)
        detail = (f"model {self._model} at {self._cfg.base_url}" if ok
                  else "set base_url to enable (see llm.base_url in config)")
        return {
            "name": self.name,
            "display_name": self.display_name,
            "configured": ok,
            "detail": detail,
        }

    def _url(self) -> str:
        base = (self._cfg.base_url or "").rstrip("/")
        return f"{base}/chat/completions"

    def _headers(self) -> dict:
        headers = {"Content-Type": "application/json"}
        if self._cfg.api_key:
            headers["Authorization"] = f"Bearer {self._cfg.api_key}"
        return headers

    def _body(self, system: str, user: str, *, stream: bool) -> dict:
        return {
            "model": self._model,
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            "stream": stream,
        }

    async def complete(self, system: str, user: str) -> str:
        client = self._client_factory(timeout=TIMEOUT)
        async with client:
            try:
                resp = await client.post(
                    self._url(), headers=self._headers(),
                    json=self._body(system, user, stream=False))
            except httpx.HTTPError as exc:
                raise LLMError(f"OpenAI-compatible request failed: {exc}") from exc
            if resp.status_code < 200 or resp.status_code >= 300:
                raise LLMError(
                    f"OpenAI-compatible endpoint returned {resp.status_code}: "
                    f"{_body_snippet(resp.text)}")
            try:
                data = resp.json()
                return data["choices"][0]["message"]["content"]
            except (json.JSONDecodeError, KeyError, IndexError, TypeError) as exc:
                raise LLMError(
                    f"OpenAI-compatible endpoint returned an unexpected "
                    f"payload: {exc}") from exc

    async def stream(self, system: str, user: str) -> AsyncIterator[str]:
        # `async with client:` encloses the entire streaming iteration, so
        # the underlying transport closes deterministically on every exit
        # path: normal completion, a non-2xx response, a mid-stream parse
        # error, or an early consumer stop. GeneratorExit (early consumer
        # stop, via aclose()) is a BaseException, not an Exception, so it is
        # never caught by the `except httpx.HTTPError` /
        # `except (json.JSONDecodeError, ...)` clauses below; it still
        # unwinds through the `async with` blocks, closing the client.
        client = self._client_factory(timeout=TIMEOUT)
        async with client:
            try:
                async with client.stream(
                    "POST", self._url(), headers=self._headers(),
                    json=self._body(system, user, stream=True),
                ) as resp:
                    if resp.status_code < 200 or resp.status_code >= 300:
                        raw = await resp.aread()
                        raise LLMError(
                            f"OpenAI-compatible endpoint returned "
                            f"{resp.status_code}: "
                            f"{_body_snippet(raw.decode(errors='replace'))}")
                    async for line in resp.aiter_lines():
                        line = line.strip()
                        if not line:
                            continue
                        if line.startswith("data: "):
                            line = line[len("data: "):]
                        elif line.startswith("data:"):
                            line = line[len("data:"):].strip()
                        else:
                            continue
                        if line == "[DONE]":
                            break
                        try:
                            payload = json.loads(line)
                        except json.JSONDecodeError as exc:
                            raise LLMError(
                                f"OpenAI-compatible endpoint sent a "
                                f"malformed SSE chunk: {exc}") from exc
                        content = (payload.get("choices") or [{}])[0].get(
                            "delta", {}).get("content")
                        if content:
                            yield content
            except httpx.HTTPError as exc:
                raise LLMError(f"OpenAI-compatible request failed: {exc}") from exc
