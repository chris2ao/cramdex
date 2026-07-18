"""Flashcard decks from study content, plus AI-generated scenario questions."""
from __future__ import annotations

import json
import re

import content
from llm import Provider, get_provider

_SEE_LINE = re.compile(r"^see:\s*(.+)$", re.I)


def first_book(citation: str, labels: list[str]) -> str:
    """First configured book label found in a citation, or "" when there is
    none (e.g. AI-generated cards)."""
    m = re.compile(content.book_label_pattern(labels)).search(citation)
    return re.sub(r"\s+", " ", m.group(0)) if m else ""


def split_framework_body(body: str) -> tuple[str, str]:
    """Separate a framework section's trailing "See: ..." citation from prose.

    The curated files keep the citation as the section's final block, and it
    may wrap across physical lines, so everything from the last line starting
    with "See:" to the end of the section is the citation. Returns
    (back, see): the card back without the citation, and the citation text
    with bold markers stripped so the UI renders one clean citation chip.
    """
    lines = body.splitlines()
    start = None
    for i, line in enumerate(lines):
        if _SEE_LINE.match(line.strip()):
            start = i
    if start is None:
        return body.strip(), ""
    tail = []
    for line in lines[start:]:
        m = _SEE_LINE.match(line.strip())
        text = m.group(1) if m else line.strip()
        if text:
            tail.append(text)
    return "\n".join(lines[:start]).strip(), content.strip_bold(" ".join(tail))


def build_deck(glossary: list[dict], frameworks: list[dict],
               acronyms: list[dict], source: str = "all",
               labels: list[str] | None = None) -> list[dict]:
    labels = labels or []
    cards: list[dict] = []
    if source in ("all", "term"):
        cards += [{"front": g["term"], "back": g["definition"],
                   "see": g["see"], "kind": "term",
                   "book": first_book(g["see"], labels)} for g in glossary]
    if source in ("all", "framework"):
        for f in frameworks:
            back, see = split_framework_body(f["body"])
            cards.append({"front": f["title"], "back": back, "see": see,
                          "kind": "framework", "book": first_book(see, labels)})
    if source in ("all", "acronym"):
        cards += [{"front": a["acronym"], "back": a["expansion"],
                   "see": f"{a['book']} p.{a['printed_page']}",
                   "kind": "acronym", "book": a["book"]} for a in acronyms]
    return cards


def build_system(course_name: str) -> str:
    return f"You are a quiz writer for the course \"{course_name}\"."


def build_user(topic: str, count: int, example_label: str) -> str:
    return (
        f"Write {count} short scenario-based quiz questions about {topic}. "
        "Respond with ONLY a JSON array, no prose, where each item is "
        '{"question": "...", "answer": "...", "see": "'
        f'{example_label} p.X"}} with a real page citation. Keep answers '
        "under 60 words."
    )


def parse_generated(text: str) -> list[dict]:
    decoder = json.JSONDecoder()
    idx = text.find("[")
    while idx != -1:
        try:
            candidate, _ = decoder.raw_decode(text, idx)
        except json.JSONDecodeError:
            candidate = None
        if isinstance(candidate, list):
            return [
                {"question": str(i.get("question", "")),
                 "answer": str(i.get("answer", "")),
                 "see": str(i.get("see", ""))}
                for i in candidate if isinstance(i, dict)
            ]
        idx = text.find("[", idx + 1)
    raise ValueError("No JSON array in the provider's response")


async def generate(topic: str, count: int, course_name: str, example_label: str,
                   provider: Provider | None = None) -> list[dict]:
    prov = provider or get_provider()
    system = build_system(course_name)
    user = build_user(topic or "the whole course", count, example_label)
    text = await prov.complete(system, user)
    return parse_generated(text)
