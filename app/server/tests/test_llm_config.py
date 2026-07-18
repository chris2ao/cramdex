"""LLM provider config resolution from ~/.cramdex/config.yaml + env."""
import textwrap

import pytest

import config


def write_home_config(tmp_path, monkeypatch, body: str):
    # The autouse `_hermetic_env` fixture (tests/conftest.py) already clears
    # ANTHROPIC_API_KEY, CRAMDEX_LLM_API_KEY, OPENAI_API_KEY,
    # CRAMDEX_LLM_MODEL, and CRAMDEX_LLM_BASE_URL before every test, so no
    # per-test delenv loop is needed here.
    home = tmp_path / "cramdex-home"
    home.mkdir()
    (home / "config.yaml").write_text(textwrap.dedent(body), encoding="utf-8")
    monkeypatch.setenv("CRAMDEX_HOME", str(home))
    return home


def test_default_is_claude_cli_when_absent(tmp_path, monkeypatch):
    write_home_config(tmp_path, monkeypatch, "active_course: demo\n")
    cfg = config.llm_config()
    assert cfg.provider == "claude_cli"
    assert cfg.model is None
    assert cfg.has_api_key is False


def test_no_home_config_defaults_to_claude_cli(tmp_path, monkeypatch):
    monkeypatch.setenv("CRAMDEX_HOME", str(tmp_path / "empty"))
    assert config.llm_config().provider == "claude_cli"


def test_anthropic_provider_reads_key_from_env(tmp_path, monkeypatch):
    write_home_config(tmp_path, monkeypatch, """
        active_course: demo
        llm:
          provider: anthropic_api
          model: claude-opus-4-8
    """)
    monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-ant-test")
    cfg = config.llm_config()
    assert cfg.provider == "anthropic_api"
    assert cfg.model == "claude-opus-4-8"
    assert cfg.api_key == "sk-ant-test"
    assert cfg.has_api_key is True


def test_openai_compatible_key_precedence(tmp_path, monkeypatch):
    write_home_config(tmp_path, monkeypatch, """
        active_course: demo
        llm:
          provider: openai_compatible
          base_url: http://localhost:11434/v1
    """)
    monkeypatch.setenv("OPENAI_API_KEY", "openai-key")
    assert config.llm_config().api_key == "openai-key"
    monkeypatch.setenv("CRAMDEX_LLM_API_KEY", "cramdex-key")
    assert config.llm_config().api_key == "cramdex-key"  # CRAMDEX_LLM_API_KEY wins


def test_env_overrides_model_and_base_url(tmp_path, monkeypatch):
    write_home_config(tmp_path, monkeypatch, """
        active_course: demo
        llm:
          provider: openai_compatible
          model: llama3
          base_url: http://localhost:11434/v1
    """)
    monkeypatch.setenv("CRAMDEX_LLM_MODEL", "mistral")
    monkeypatch.setenv("CRAMDEX_LLM_BASE_URL", "http://host:1234/v1")
    cfg = config.llm_config()
    assert cfg.model == "mistral"
    assert cfg.base_url == "http://host:1234/v1"


def test_unknown_provider_raises(tmp_path, monkeypatch):
    write_home_config(tmp_path, monkeypatch, """
        active_course: demo
        llm:
          provider: bogus
    """)
    with pytest.raises(config.PackError, match="Unknown LLM provider"):
        config.llm_config()


def test_malformed_config_raises(tmp_path, monkeypatch):
    write_home_config(tmp_path, monkeypatch, "llm: [unclosed\n")
    with pytest.raises(config.PackError, match="Cannot read"):
        config.llm_config()
