"""
AI-assisted index term suggestions: reads page text for a book range from
the corpus DB, asks the configured LLM provider for candidate terms with
one-line definitions, and parses the reply defensively. LLMError (provider
failure) and PackError (local state) propagate to the caller.
"""

import re
import sqlite3
from pathlib import Path

import config
from llm.base import Provider
from llm.registry import get_provider

MAX_SPAN = 8
EXCERPT_CHARS = 2000
MAX_TERMS = 20

SYSTEM = (
    "You extract index-worthy terms from course book excerpts for an "
    "open-book exam index. Return up to 10 terms a student would look up "
    "during the exam. Respond with one term per line, tab separated:\n"
    "term\tone-line definition in plain words\tprinted page number\n"
    "Use only terms and page numbers that appear in the excerpts. "
    "No headers, no numbering, no other text.")


def _load_pages(db_path: Path, slug: str, first: int, last: int) -> list[tuple[int, str]]:
    if not db_path.is_file():
        raise config.PackError("Corpus index not found. Run scripts/build.sh.")
    con = sqlite3.connect(db_path)
    try:
        rows = con.execute(
            "SELECT CAST(printed_page AS INTEGER) AS p, text FROM pages"
            " WHERE slug = ? AND CAST(printed_page AS INTEGER) BETWEEN ? AND ?"
            " ORDER BY p",
            (slug, first, last)).fetchall()
    finally:
        con.close()
    return [(int(p), t or "") for p, t in rows]


def _parse_reply(reply: str, first: int, last: int) -> list[dict]:
    items: list[dict] = []
    seen: set[str] = set()
    for line in reply.splitlines():
        parts = line.strip().split("\t")
        if len(parts) != 3:
            continue
        term, definition, page_raw = (p.strip() for p in parts)
        if not term or not re.fullmatch(r"\d+", page_raw):
            continue
        page = int(page_raw)
        if not first <= page <= last:
            continue
        key = term.lower()
        if key in seen:
            continue
        seen.add(key)
        items.append({"term": term, "definition": definition,
                      "printed_page": page})
        if len(items) >= MAX_TERMS:
            break
    return items


async def suggest_terms(slug: str, first_page: int, last_page: int,
                        db_path: Path | None = None,
                        provider: Provider | None = None) -> list[dict]:
    pages = _load_pages(db_path or config.db_path(), slug, first_page, last_page)
    if not pages:
        return []
    excerpts = "\n\n".join(
        f"[p.{page}]\n{text[:EXCERPT_CHARS]}" for page, text in pages)
    prov = provider or get_provider()
    reply = await prov.complete(SYSTEM, f"Book excerpts:\n\n{excerpts}")
    return _parse_reply(reply, first_page, last_page)
