"""OpenAI-compatible provider: fakes the transport so no network call ever happens."""
import json

import httpx
import pytest

import config
from llm.base import LLMError

CFG = config.LlmConfig("openai_compatible", "llama3",
                       "http://localhost:11434/v1", "key")


def _factory(handler, closed=None):
    """Build a client_factory bound to a MockTransport handler.

    When `closed` (a dict) is provided, the returned client is a thin
    httpx.AsyncClient subclass whose `__aexit__` records
    `closed["client"] = True`, so tests can assert the client's async
    context manager was exited (transport closed) on every code path.
    """
    class _TrackedClient(httpx.AsyncClient):
        async def __aexit__(self, *a):
            result = await super().__aexit__(*a)
            if closed is not None:
                closed["client"] = True
            return result

    def make(**kw):
        cls = _TrackedClient if closed is not None else httpx.AsyncClient
        return cls(transport=httpx.MockTransport(handler), **kw)
    return make


def test_status_needs_base_url():
    from llm.openai_compat import OpenAICompatProvider
    cfg = config.LlmConfig("openai_compatible", None, None, None)
    assert OpenAICompatProvider(cfg).status()["configured"] is False


def test_status_detail_actionable_without_base_url():
    from llm.openai_compat import OpenAICompatProvider
    cfg = config.LlmConfig("openai_compatible", None, None, None)
    status = OpenAICompatProvider(cfg).status()
    assert "base_url" in status["detail"]


def test_status_configured_with_base_url():
    from llm.openai_compat import OpenAICompatProvider
    status = OpenAICompatProvider(CFG).status()
    assert status["configured"] is True
    assert status["name"] == "openai_compatible"
    assert status["display_name"] == "OpenAI-compatible"
    assert CFG.model in status["detail"]
    assert CFG.base_url in status["detail"]


def test_status_defaults_model_when_unset():
    from llm.openai_compat import OpenAICompatProvider
    cfg = config.LlmConfig("openai_compatible", None,
                            "http://localhost:11434/v1", "key")
    assert "gpt-4o-mini" in OpenAICompatProvider(cfg).status()["detail"]


@pytest.mark.asyncio
async def test_complete(monkeypatch):
    def handler(req):
        return httpx.Response(200, json={
            "choices": [{"message": {"content": "the answer"}}]})
    from llm.openai_compat import OpenAICompatProvider
    prov = OpenAICompatProvider(CFG, client_factory=_factory(handler))
    assert await prov.complete("SYS", "USER") == "the answer"


@pytest.mark.asyncio
async def test_complete_posts_expected_body_and_headers():
    captured = {}

    def handler(req):
        captured["url"] = str(req.url)
        captured["auth"] = req.headers.get("authorization")
        captured["body"] = json.loads(req.content)
        return httpx.Response(200, json={
            "choices": [{"message": {"content": "ok"}}]})

    from llm.openai_compat import OpenAICompatProvider
    prov = OpenAICompatProvider(CFG, client_factory=_factory(handler))
    await prov.complete("SYS", "USER")

    assert captured["url"] == "http://localhost:11434/v1/chat/completions"
    assert captured["auth"] == "Bearer key"
    assert captured["body"]["model"] == "llama3"
    assert captured["body"]["stream"] is False
    assert captured["body"]["messages"] == [
        {"role": "system", "content": "SYS"},
        {"role": "user", "content": "USER"},
    ]


@pytest.mark.asyncio
async def test_complete_omits_auth_header_without_api_key():
    captured = {}

    def handler(req):
        captured["auth"] = req.headers.get("authorization")
        return httpx.Response(200, json={
            "choices": [{"message": {"content": "ok"}}]})

    cfg = config.LlmConfig("openai_compatible", "llama3",
                            "http://localhost:11434/v1", None)
    from llm.openai_compat import OpenAICompatProvider
    prov = OpenAICompatProvider(cfg, client_factory=_factory(handler))
    await prov.complete("SYS", "USER")
    assert captured["auth"] is None


@pytest.mark.asyncio
async def test_complete_closes_client(monkeypatch):
    # The client is constructed fresh per call via client_factory and must
    # be closed deterministically (via `async with client:`) to avoid
    # leaking the underlying httpx transport/connections in a long-running
    # server.
    closed = {}

    def handler(req):
        return httpx.Response(200, json={
            "choices": [{"message": {"content": "the answer"}}]})

    from llm.openai_compat import OpenAICompatProvider
    prov = OpenAICompatProvider(CFG, client_factory=_factory(handler, closed=closed))
    result = await prov.complete("SYS", "USER")
    assert result == "the answer"
    assert closed.get("client") is True


@pytest.mark.asyncio
async def test_stream(monkeypatch):
    body = (
        'data: {"choices":[{"delta":{"content":"He"}}]}\n\n'
        'data: {"choices":[{"delta":{"content":"llo"}}]}\n\n'
        'data: [DONE]\n\n'
    )
    def handler(req):
        return httpx.Response(200, text=body,
                              headers={"content-type": "text/event-stream"})
    from llm.openai_compat import OpenAICompatProvider
    prov = OpenAICompatProvider(CFG, client_factory=_factory(handler))
    out = [c async for c in prov.stream("SYS", "USER")]
    assert "".join(out) == "Hello"


@pytest.mark.asyncio
async def test_stream_posts_stream_true():
    captured = {}
    body = 'data: {"choices":[{"delta":{"content":"x"}}]}\n\ndata: [DONE]\n\n'

    def handler(req):
        captured["body"] = json.loads(req.content)
        return httpx.Response(200, text=body,
                              headers={"content-type": "text/event-stream"})

    from llm.openai_compat import OpenAICompatProvider
    prov = OpenAICompatProvider(CFG, client_factory=_factory(handler))
    out = [c async for c in prov.stream("SYS", "USER")]
    assert "".join(out) == "x"
    assert captured["body"]["stream"] is True


@pytest.mark.asyncio
async def test_stream_closes_client_after_full_consumption():
    closed = {}
    body = (
        'data: {"choices":[{"delta":{"content":"He"}}]}\n\n'
        'data: {"choices":[{"delta":{"content":"llo"}}]}\n\n'
        'data: [DONE]\n\n'
    )
    def handler(req):
        return httpx.Response(200, text=body,
                              headers={"content-type": "text/event-stream"})
    from llm.openai_compat import OpenAICompatProvider
    prov = OpenAICompatProvider(CFG, client_factory=_factory(handler, closed=closed))
    out = [c async for c in prov.stream("SYS", "USER")]
    assert "".join(out) == "Hello"
    assert closed.get("client") is True


@pytest.mark.asyncio
async def test_stream_closes_client_on_early_aclose():
    # If the consumer stops iterating early, GeneratorExit must propagate
    # untouched (no except clause should swallow it and re-raise as
    # LLMError), and the client must still close on the way out because the
    # `async with client:` block encloses the streaming iteration.
    closed = {}
    body = (
        'data: {"choices":[{"delta":{"content":"He"}}]}\n\n'
        'data: {"choices":[{"delta":{"content":"llo"}}]}\n\n'
        'data: [DONE]\n\n'
    )
    def handler(req):
        return httpx.Response(200, text=body,
                              headers={"content-type": "text/event-stream"})
    from llm.openai_compat import OpenAICompatProvider
    prov = OpenAICompatProvider(CFG, client_factory=_factory(handler, closed=closed))
    agen = prov.stream("SYS", "USER")
    first = await agen.__anext__()
    assert first == "He"
    await agen.aclose()  # must not raise LLMError
    assert closed.get("client") is True


@pytest.mark.asyncio
async def test_stream_mid_stream_json_error_raises_and_closes_client():
    # A valid delta arrives first, then a chunk with broken JSON. The
    # JSONDecodeError must be wrapped as LLMError (not propagate raw), and
    # the client must still close on the way out, mirroring the mid-stream
    # error closure path covered for the Anthropic provider.
    closed = {}
    body = (
        'data: {"choices":[{"delta":{"content":"He"}}]}\n\n'
        'data: {"choices": [\n\n'
    )
    def handler(req):
        return httpx.Response(200, text=body,
                              headers={"content-type": "text/event-stream"})
    from llm.openai_compat import OpenAICompatProvider
    prov = OpenAICompatProvider(CFG, client_factory=_factory(handler, closed=closed))
    collected = []
    with pytest.raises(LLMError):
        async for chunk in prov.stream("SYS", "USER"):
            collected.append(chunk)
    assert collected == ["He"]
    assert closed.get("client") is True


@pytest.mark.asyncio
async def test_http_error_raises(monkeypatch):
    def handler(req):
        return httpx.Response(500, text="server error")
    from llm.openai_compat import OpenAICompatProvider
    prov = OpenAICompatProvider(CFG, client_factory=_factory(handler))
    with pytest.raises(LLMError):
        await prov.complete("SYS", "USER")


@pytest.mark.asyncio
async def test_http_error_includes_status_and_body_tail_not_key():
    def handler(req):
        return httpx.Response(503, text="upstream unavailable, detail xyz")
    from llm.openai_compat import OpenAICompatProvider
    prov = OpenAICompatProvider(CFG, client_factory=_factory(handler))
    with pytest.raises(LLMError) as exc_info:
        await prov.complete("SYS", "USER")
    message = str(exc_info.value)
    assert "503" in message
    assert "upstream unavailable" in message
    assert "key" not in message  # the CFG.api_key value must never leak


@pytest.mark.asyncio
async def test_complete_closes_client_on_http_error():
    closed = {}

    def handler(req):
        return httpx.Response(500, text="server error")

    from llm.openai_compat import OpenAICompatProvider
    prov = OpenAICompatProvider(CFG, client_factory=_factory(handler, closed=closed))
    with pytest.raises(LLMError):
        await prov.complete("SYS", "USER")
    assert closed.get("client") is True


class _OneShotStream(httpx.AsyncByteStream):
    """A genuinely-streamed httpx response body (not pre-buffered).

    `httpx.Response(status, text=...)` pre-buffers the body, so a test built
    on it would still pass even if the implementation read `resp.text`
    directly instead of `await resp.aread()`, a bug that breaks on a real
    wire, where the body is not available until read. This stream forces
    the same code path a live streaming HTTP response takes: `.text` raises
    `httpx.ResponseNotRead` until `.aread()`/`.read()` has been called.
    """

    def __init__(self, data: bytes):
        self._data = data

    async def __aiter__(self):
        yield self._data


@pytest.mark.asyncio
async def test_stream_http_error_raises_and_closes_client():
    closed = {}

    def handler(req):
        return httpx.Response(500, stream=_OneShotStream(b"server error"),
                              headers={"content-type": "text/plain"})

    from llm.openai_compat import OpenAICompatProvider
    prov = OpenAICompatProvider(CFG, client_factory=_factory(handler, closed=closed))
    with pytest.raises(LLMError) as exc_info:
        async for _ in prov.stream("SYS", "USER"):
            pass
    message = str(exc_info.value)
    assert "500" in message
    assert "server error" in message
    assert closed.get("client") is True


@pytest.mark.asyncio
async def test_complete_malformed_payload_raises_llm_error():
    def handler(req):
        return httpx.Response(200, json={"unexpected": "shape"})
    from llm.openai_compat import OpenAICompatProvider
    prov = OpenAICompatProvider(CFG, client_factory=_factory(handler))
    with pytest.raises(LLMError):
        await prov.complete("SYS", "USER")


@pytest.mark.asyncio
async def test_complete_invalid_json_syntax_raises_llm_error():
    def handler(req):
        return httpx.Response(200, text="not json{")
    from llm.openai_compat import OpenAICompatProvider
    prov = OpenAICompatProvider(CFG, client_factory=_factory(handler))
    with pytest.raises(LLMError):
        await prov.complete("SYS", "USER")
