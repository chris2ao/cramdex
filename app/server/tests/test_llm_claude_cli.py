"""Claude CLI provider: parses stream-json deltas; reports status by PATH."""
import asyncio
import json
import shutil

import pytest

import config
from llm.claude_cli import ClaudeCliProvider, extract_text_delta

CFG = config.LlmConfig(provider="claude_cli", model=None, base_url=None, api_key=None)


class _FakeStdout:
    def __init__(self, lines):
        self._lines = list(lines)

    def __aiter__(self):
        return self

    async def __anext__(self):
        if self._lines:
            return self._lines.pop(0)
        raise StopAsyncIteration


class _FakeStderr:
    def __init__(self, data: bytes):
        self._data = data

    async def read(self):
        return self._data


class _FakeProc:
    def __init__(self, stdout_lines, returncode, stderr):
        self.stdout = _FakeStdout(stdout_lines)
        self.stderr = _FakeStderr(stderr)
        self.returncode = returncode
        self.killed = False

    def kill(self):
        self.killed = True

    async def wait(self):
        return self.returncode


def _install_fake_proc(monkeypatch, stdout_lines, returncode=0, stderr=b""):
    """Patch asyncio.create_subprocess_exec with a stub claude process."""
    fake = _FakeProc(stdout_lines, returncode, stderr)

    async def fake_exec(*cmd, **kwargs):
        return fake

    monkeypatch.setattr(asyncio, "create_subprocess_exec", fake_exec)
    return fake


def test_status_reflects_cli_on_path(monkeypatch):
    monkeypatch.setattr(shutil, "which", lambda name: "/usr/bin/claude")
    s = ClaudeCliProvider(CFG).status()
    assert s["name"] == "claude_cli"
    assert s["configured"] is True
    monkeypatch.setattr(shutil, "which", lambda name: None)
    assert ClaudeCliProvider(CFG).status()["configured"] is False


@pytest.mark.asyncio
async def test_stream_parses_deltas(monkeypatch):
    lines = [
        b'{"type":"stream_event","event":{"type":"content_block_delta",'
        b'"delta":{"type":"text_delta","text":"Hello "}}}\n',
        b'{"type":"stream_event","event":{"type":"content_block_delta",'
        b'"delta":{"type":"text_delta","text":"world"}}}\n',
    ]
    monkeypatch.setattr(shutil, "which", lambda name: "/usr/bin/claude")
    _install_fake_proc(monkeypatch, stdout_lines=lines, returncode=0)
    out = [chunk async for chunk in ClaudeCliProvider(CFG).stream("SYS", "USER")]
    assert "".join(out) == "Hello world"


@pytest.mark.asyncio
async def test_complete_joins_stream(monkeypatch):
    lines = [
        b'{"type":"stream_event","event":{"type":"content_block_delta",'
        b'"delta":{"type":"text_delta","text":"A"}}}\n',
        b'{"type":"stream_event","event":{"type":"content_block_delta",'
        b'"delta":{"type":"text_delta","text":"B"}}}\n',
    ]
    monkeypatch.setattr(shutil, "which", lambda name: "/usr/bin/claude")
    _install_fake_proc(monkeypatch, stdout_lines=lines, returncode=0)
    assert await ClaudeCliProvider(CFG).complete("SYS", "USER") == "AB"


@pytest.mark.asyncio
async def test_missing_cli_raises_llm_error(monkeypatch):
    from llm.base import LLMError
    monkeypatch.setattr(shutil, "which", lambda name: None)
    with pytest.raises(LLMError, match="Claude CLI not found"):
        async for _ in ClaudeCliProvider(CFG).stream("SYS", "USER"):
            pass


@pytest.mark.asyncio
async def test_nonzero_exit_raises_llm_error_with_stderr_tail(monkeypatch):
    from llm.base import LLMError
    monkeypatch.setattr(shutil, "which", lambda name: "/usr/bin/claude")
    _install_fake_proc(monkeypatch, stdout_lines=[], returncode=1,
                        stderr=b"permission denied")
    with pytest.raises(LLMError, match="permission denied"):
        async for _ in ClaudeCliProvider(CFG).stream("SYS", "USER"):
            pass


def test_extract_text_delta_parses_stream_json():
    line = json.dumps({"type": "stream_event", "event": {
        "type": "content_block_delta",
        "delta": {"type": "text_delta", "text": "Ops tempo is"}}})
    assert extract_text_delta(line) == "Ops tempo is"


def test_extract_text_delta_ignores_other_lines():
    assert extract_text_delta(json.dumps({"type": "system"})) == ""
    assert extract_text_delta("not json at all") == ""


def test_extract_text_delta_ignores_non_object_json():
    assert extract_text_delta("null") == ""
    assert extract_text_delta("[1]") == ""


class _HangingFakeStdout:
    """Yields the given lines, then hangs forever, standing in for a claude
    CLI subprocess whose stdout stays open past the caller's interest."""

    def __init__(self, lines):
        self._lines = list(lines)

    def __aiter__(self):
        return self

    async def __anext__(self):
        if self._lines:
            return self._lines.pop(0)
        await asyncio.Event().wait()  # hang until the generator is closed


class _HangingFakeProc:
    def __init__(self, lines):
        self.stdout = _HangingFakeStdout(lines)
        self.stderr = _FakeStderr(b"")
        self.killed = False
        self.returncode = None

    def kill(self):
        self.killed = True
        self.returncode = -9

    async def wait(self):
        if self.returncode is None:
            self.returncode = 0
        return self.returncode


@pytest.mark.asyncio
async def test_stream_kills_subprocess_and_stays_sandboxed_on_disconnect(monkeypatch):
    """Ported from the old ask-level test that exercised ask.py's own
    duplicate subprocess path (now deleted): a caller that closes the
    generator mid-stream must kill the child process, and the process must
    still have been launched with the tool sandbox and outside the repo."""
    delta = json.dumps({"type": "stream_event", "event": {
        "type": "content_block_delta", "delta": {"type": "text_delta", "text": "hi"}}})
    fake = _HangingFakeProc([(delta + "\n").encode()])
    captured = {}

    async def fake_exec(*cmd, **kwargs):
        captured["cmd"], captured["kwargs"] = cmd, kwargs
        return fake

    monkeypatch.setattr(shutil, "which", lambda name: "/usr/bin/claude")
    monkeypatch.setattr(asyncio, "create_subprocess_exec", fake_exec)

    gen = ClaudeCliProvider(CFG).stream("SYS", "USER")
    assert await gen.__anext__() == "hi"
    await gen.aclose()

    assert fake.killed
    assert "--disallowedTools" in captured["cmd"]
    assert "--strict-mcp-config" in captured["cmd"]
    assert not str(captured["kwargs"].get("cwd", "")).startswith(str(config.REPO_ROOT))
