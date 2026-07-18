"""Build the active LLM provider from config."""
from __future__ import annotations

import config
from llm.base import LLMError, Provider


def get_provider(cfg: config.LlmConfig | None = None) -> Provider:
    cfg = cfg or config.llm_config()
    if cfg.provider == "claude_cli":
        from llm.claude_cli import ClaudeCliProvider
        return ClaudeCliProvider(cfg)
    if cfg.provider == "anthropic_api":
        from llm.anthropic_api import AnthropicProvider
        return AnthropicProvider(cfg)
    if cfg.provider == "openai_compatible":
        from llm.openai_compat import OpenAICompatProvider
        return OpenAICompatProvider(cfg)
    raise LLMError(
        f"Unknown LLM provider '{cfg.provider}'. Choose one of: "
        f"{', '.join(config.LLM_PROVIDERS)}.")
