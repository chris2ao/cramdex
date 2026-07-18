"""Grounded AI answers streamed from the configured LLM provider."""
from __future__ import annotations

import contextlib
import json
import sqlite3
from pathlib import Path
from typing import AsyncIterator

import config
import search
from llm import LLMError, Provider, get_provider

TOP_PASSAGES = 8


def _passages_for(question: str, db_path: Path | None) -> list[dict]:
    con = sqlite3.connect(db_path or config.db_path())
    con.row_factory = sqlite3.Row
    try:
        match = search.build_match(question, "or")
        rows = con.execute(
            """SELECT slug, label, printed_page,
                      snippet(pages, 4, '[[', ']]', ' ... ', 16) AS snippet,
                      text
               FROM pages WHERE pages MATCH ? ORDER BY bm25(pages) LIMIT ?""",
            (match, TOP_PASSAGES),
        ).fetchall()
        return [dict(r) for r in rows]
    finally:
        con.close()


def build_system(course_name: str) -> str:
    return (
        f"You are a study assistant for the course \"{course_name}\". Answer "
        "the question using ONLY the passages below. Cite printed pages "
        "inline in the form (<book label> p.X), using the exact book labels "
        "shown on the passages, for every claim. If the passages do not "
        "answer the question, say so plainly."
    )


def build_user(question: str, passages: list[dict]) -> str:
    blocks = [
        f"[{p['label']} p.{p['printed_page']}]\n{p['text'].strip()}"
        for p in passages
    ]
    joined = "\n\n---\n\n".join(blocks)
    return f"PASSAGES:\n\n{joined}\n\nQUESTION: {question}\n"


def _sse(event: str, data: str) -> str:
    payload = "\n".join(f"data: {ln}" for ln in data.split("\n"))
    return f"event: {event}\n{payload}\n\n"


async def stream_answer(question: str, db_path: Path | None = None,
                        provider: Provider | None = None) -> AsyncIterator[str]:
    passages = _passages_for(question, db_path)
    sources = [{k: p[k] for k in ("slug", "label", "printed_page", "snippet")}
               for p in passages]
    yield _sse("sources", json.dumps(sources))
    if not passages:
        yield _sse("error", "No relevant passages found in the corpus.")
        return

    try:
        prov = provider or get_provider()
        system = build_system(config.manifest().name)
        user = build_user(question, passages)
        async with contextlib.aclosing(prov.stream(system, user)) as agen:
            async for chunk in agen:
                if chunk:
                    yield _sse("delta", chunk)
        yield _sse("done", "")
    except (LLMError, config.PackError) as exc:
        yield _sse("error", str(exc))
