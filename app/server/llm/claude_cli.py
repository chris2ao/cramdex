"""Claude CLI provider: sandboxed `claude -p` subprocess with stream-json output."""
from __future__ import annotations

import asyncio
import json
import shutil
import tempfile
from typing import AsyncIterator

import config
from config import DISALLOWED_TOOLS
from llm.base import LLMError

TIMEOUT_SECONDS = 180


def extract_text_delta(line: str) -> str:
    try:
        obj = json.loads(line)
    except (json.JSONDecodeError, TypeError):
        return ""
    if not isinstance(obj, dict):
        return ""
    if obj.get("type") != "stream_event":
        return ""
    event = obj.get("event", {})
    if event.get("type") != "content_block_delta":
        return ""
    delta = event.get("delta", {})
    if delta.get("type") != "text_delta":
        return ""
    return delta.get("text", "")


class ClaudeCliProvider:
    """Runs prompts through the locally installed `claude` CLI in a sandbox."""

    name = "claude_cli"
    display_name = "Claude CLI"

    def __init__(self, cfg: config.LlmConfig):
        self._cfg = cfg

    async def stream(self, system: str, user: str) -> AsyncIterator[str]:
        if shutil.which("claude") is None:
            raise LLMError(
                "Claude CLI not found on PATH. Install Claude Code, or switch "
                "the LLM provider in ~/.cramdex/config.yaml.")
        prompt = f"{system}\n\n{user}"
        proc = None
        try:
            proc = await asyncio.create_subprocess_exec(
                "claude", "-p", prompt,
                "--output-format", "stream-json",
                "--include-partial-messages", "--verbose",
                "--disallowedTools", DISALLOWED_TOOLS,
                "--strict-mcp-config",
                stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE,
                cwd=tempfile.gettempdir(),
            )
            assert proc.stdout is not None
            async with asyncio.timeout(TIMEOUT_SECONDS):
                async for raw in proc.stdout:
                    text = extract_text_delta(raw.decode("utf-8", "replace"))
                    if text:
                        yield text
            await proc.wait()
            if proc.returncode != 0:
                stderr = (await proc.stderr.read()).decode("utf-8", "replace")
                raise LLMError(
                    f"Claude CLI failed: {stderr.strip()[:300]}")
        except (TimeoutError, asyncio.TimeoutError) as exc:
            raise LLMError(
                f"Claude CLI timed out after {TIMEOUT_SECONDS}s.") from exc
        except FileNotFoundError as exc:
            raise LLMError("Claude CLI not found on PATH.") from exc
        finally:
            if proc is not None and proc.returncode is None:
                proc.kill()
                await proc.wait()

    async def complete(self, system: str, user: str) -> str:
        chunks = [chunk async for chunk in self.stream(system, user)]
        return "".join(chunks)

    def status(self) -> dict:
        found = shutil.which("claude") is not None
        return {
            "name": self.name,
            "display_name": self.display_name,
            "configured": found,
            "detail": ("claude CLI found on PATH" if found else
                       "claude CLI not found on PATH"),
        }
