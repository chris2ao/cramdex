"""Anthropic API provider: fakes the SDK so no network call ever happens."""
import sys
import types
from types import SimpleNamespace

import pytest

import config
from llm.base import LLMError

CFG = config.LlmConfig(provider="anthropic_api", model="claude-opus-4-8",
                        base_url=None, api_key="sk-ant-test")


def _install_fake_anthropic(monkeypatch, *, deltas=None, text="hi", raises=None,
                             stream_mid_raises=False, closed=None):
    """Install a fake `anthropic` module in sys.modules.

    If `closed` (a dict) is provided, the fake client's `__aexit__` sets
    `closed["client"] = True`, so tests can assert the client's async
    context manager was exited (transport closed) on every code path.
    """
    class FakeStream:
        async def __aenter__(self):
            return self

        async def __aexit__(self, *a):
            return False

        @property
        def text_stream(self):
            async def gen():
                for d in (deltas or []):
                    yield d
                if stream_mid_raises:
                    # Raised from the same module object the implementation
                    # will later reference as `anthropic.APIError`, so the
                    # class identity matches at except-clause time.
                    raise fake_mod.APIError("mid-stream boom")
            return gen()

    class FakeMessages:
        def stream(self, **kw):
            if raises:
                raise raises
            return FakeStream()

        async def create(self, **kw):
            if raises:
                raise raises
            return SimpleNamespace(content=[SimpleNamespace(type="text", text=text)])

    class FakeAsyncAnthropic:
        def __init__(self, **kw):
            self.messages = FakeMessages()

        async def __aenter__(self):
            return self

        async def __aexit__(self, *a):
            if closed is not None:
                closed["client"] = True
            return False

    fake_mod = types.ModuleType("anthropic")
    fake_mod.AsyncAnthropic = FakeAsyncAnthropic
    fake_mod.APIError = type("APIError", (Exception,), {})
    fake_mod.AuthenticationError = type("AuthenticationError", (fake_mod.APIError,), {})
    monkeypatch.setitem(sys.modules, "anthropic", fake_mod)
    return fake_mod


def test_status_unconfigured_without_key(monkeypatch):
    _install_fake_anthropic(monkeypatch)
    from llm.anthropic_api import AnthropicProvider
    cfg = config.LlmConfig("anthropic_api", "claude-opus-4-8", None, None)
    assert AnthropicProvider(cfg).status()["configured"] is False


def test_status_configured_with_key(monkeypatch):
    _install_fake_anthropic(monkeypatch)
    from llm.anthropic_api import AnthropicProvider
    status = AnthropicProvider(CFG).status()
    assert status["configured"] is True
    assert status["name"] == "anthropic_api"
    assert status["display_name"] == "Anthropic API"


def test_status_defaults_model_when_unset(monkeypatch):
    _install_fake_anthropic(monkeypatch)
    from llm.anthropic_api import AnthropicProvider
    cfg = config.LlmConfig("anthropic_api", None, None, "sk-ant-test")
    assert "claude-opus-4-8" in AnthropicProvider(cfg).status()["detail"]


@pytest.mark.asyncio
async def test_complete_returns_text(monkeypatch):
    _install_fake_anthropic(monkeypatch, text="answer")
    from llm.anthropic_api import AnthropicProvider
    assert await AnthropicProvider(CFG).complete("SYS", "USER") == "answer"


@pytest.mark.asyncio
async def test_complete_closes_client(monkeypatch):
    # The SDK client is constructed fresh per call and must be closed
    # deterministically (via `async with client:`) to avoid leaking the
    # underlying httpx transport/connections in a long-running server.
    closed = {}
    _install_fake_anthropic(monkeypatch, text="answer", closed=closed)
    from llm.anthropic_api import AnthropicProvider
    result = await AnthropicProvider(CFG).complete("SYS", "USER")
    assert result == "answer"
    assert closed.get("client") is True


@pytest.mark.asyncio
async def test_stream_yields_deltas(monkeypatch):
    _install_fake_anthropic(monkeypatch, deltas=["a", "b", "c"])
    from llm.anthropic_api import AnthropicProvider
    out = [c async for c in AnthropicProvider(CFG).stream("SYS", "USER")]
    assert "".join(out) == "abc"


@pytest.mark.asyncio
async def test_stream_closes_client_after_full_consumption(monkeypatch):
    closed = {}
    _install_fake_anthropic(monkeypatch, deltas=["a", "b", "c"], closed=closed)
    from llm.anthropic_api import AnthropicProvider
    out = [c async for c in AnthropicProvider(CFG).stream("SYS", "USER")]
    assert "".join(out) == "abc"
    assert closed.get("client") is True


@pytest.mark.asyncio
async def test_api_error_becomes_llm_error(monkeypatch):
    fake = _install_fake_anthropic(monkeypatch)
    fake.AsyncAnthropic = lambda **kw: (_ for _ in ()).throw(fake.APIError("boom"))
    from llm.anthropic_api import AnthropicProvider
    with pytest.raises(LLMError):
        await AnthropicProvider(CFG).complete("SYS", "USER")


@pytest.mark.asyncio
async def test_stream_api_error_on_client_construction_becomes_llm_error(monkeypatch):
    # Client construction happens inside _client(), which stream() calls;
    # the wrapping must cover construction, not only the SDK call itself.
    fake = _install_fake_anthropic(monkeypatch)
    fake.AsyncAnthropic = lambda **kw: (_ for _ in ()).throw(fake.APIError("boom"))
    from llm.anthropic_api import AnthropicProvider
    with pytest.raises(LLMError):
        async for _ in AnthropicProvider(CFG).stream("SYS", "USER"):
            pass


@pytest.mark.asyncio
async def test_stream_mid_stream_api_error_becomes_llm_error(monkeypatch):
    _install_fake_anthropic(monkeypatch, deltas=["a", "b"], stream_mid_raises=True)
    from llm.anthropic_api import AnthropicProvider
    collected = []
    with pytest.raises(LLMError):
        async for chunk in AnthropicProvider(CFG).stream("SYS", "USER"):
            collected.append(chunk)
    assert collected == ["a", "b"]


@pytest.mark.asyncio
async def test_stream_closes_client_on_mid_stream_error(monkeypatch):
    # The client must be closed even when the SDK raises mid-stream and the
    # error surfaces as an LLMError, not just on the happy path.
    closed = {}
    _install_fake_anthropic(monkeypatch, deltas=["a", "b"], stream_mid_raises=True,
                             closed=closed)
    from llm.anthropic_api import AnthropicProvider
    with pytest.raises(LLMError):
        async for _ in AnthropicProvider(CFG).stream("SYS", "USER"):
            pass
    assert closed.get("client") is True


@pytest.mark.asyncio
async def test_missing_api_key_raises_llm_error_without_leaking_key(monkeypatch):
    _install_fake_anthropic(monkeypatch)
    from llm.anthropic_api import AnthropicProvider
    cfg = config.LlmConfig("anthropic_api", "claude-opus-4-8", None, None)
    with pytest.raises(LLMError) as exc_info:
        await AnthropicProvider(cfg).complete("SYS", "USER")
    assert "sk-ant" not in str(exc_info.value)


@pytest.mark.asyncio
async def test_stream_generator_exit_not_wrapped(monkeypatch):
    # If the consumer stops iterating early, GeneratorExit must propagate
    # untouched rather than being caught and wrapped as an LLMError. The
    # client must still be closed, since GeneratorExit unwinds through the
    # `async with client:` block just like any other exception.
    closed = {}
    _install_fake_anthropic(monkeypatch, deltas=["a", "b", "c"], closed=closed)
    from llm.anthropic_api import AnthropicProvider
    agen = AnthropicProvider(CFG).stream("SYS", "USER")
    first = await agen.__anext__()
    assert first == "a"
    await agen.aclose()  # must not raise LLMError
    assert closed.get("client") is True
