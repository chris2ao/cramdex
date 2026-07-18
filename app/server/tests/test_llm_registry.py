"""Registry: builds the configured provider; unknown providers raise LLMError."""
import sys
import types

import pytest

import config
from llm.base import LLMError
from llm.claude_cli import ClaudeCliProvider
from llm.registry import get_provider


def test_get_provider_returns_claude_cli_for_claude_cli_config():
    cfg = config.LlmConfig(provider="claude_cli", model=None, base_url=None,
                            api_key=None)
    provider = get_provider(cfg)
    assert isinstance(provider, ClaudeCliProvider)


def test_get_provider_returns_anthropic_api_for_anthropic_api_config(monkeypatch):
    # Fake the SDK so the lazy `from llm.anthropic_api import AnthropicProvider`
    # inside registry.get_provider resolves against a fake, never the real
    # network-capable SDK.
    fake_mod = types.ModuleType("anthropic")
    fake_mod.AsyncAnthropic = object
    fake_mod.APIError = type("APIError", (Exception,), {})
    monkeypatch.setitem(sys.modules, "anthropic", fake_mod)

    from llm.anthropic_api import AnthropicProvider

    cfg = config.LlmConfig(provider="anthropic_api", model=None, base_url=None,
                            api_key="sk-ant-test")
    provider = get_provider(cfg)
    assert isinstance(provider, AnthropicProvider)


def test_get_provider_returns_openai_compatible_for_openai_compatible_config():
    from llm.openai_compat import OpenAICompatProvider

    cfg = config.LlmConfig(provider="openai_compatible", model=None,
                            base_url="http://localhost:11434/v1", api_key=None)
    provider = get_provider(cfg)
    assert isinstance(provider, OpenAICompatProvider)


def test_get_provider_raises_llm_error_for_unknown_provider():
    # Constructed directly to bypass llm_config()'s provider validation.
    cfg = config.LlmConfig(provider="bogus", model=None, base_url=None,
                            api_key=None)
    with pytest.raises(
            LLMError,
            match=r"Unknown LLM provider 'bogus'\. Choose one of: "
                  r"claude_cli, anthropic_api, openai_compatible\."):
        get_provider(cfg)
