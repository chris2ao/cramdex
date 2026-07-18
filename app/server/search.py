"""FTS5 corpus search (logic mirrors scripts/search.py)."""
from __future__ import annotations

import re
import sqlite3
from pathlib import Path

import config


def build_match(query: str, mode: str = "phrase") -> str:
    if mode == "raw":
        return query
    tokens = re.findall(r"[A-Za-z0-9]+", query)
    if not tokens:
        return '"' + query.replace('"', "") + '"'
    if mode == "or":
        return " OR ".join(tokens)
    return '"' + " ".join(tokens) + '"'


def search_pages(
    q: str,
    book: str | None = None,
    mode: str = "phrase",
    limit: int = 20,
    db_path: Path | None = None,
) -> list[dict]:
    path = db_path or config.db_path()
    con = sqlite3.connect(path)
    con.row_factory = sqlite3.Row
    where = "pages MATCH ?"
    params: list = [build_match(q, mode)]
    if book:
        where += " AND slug = ?"
        params.append(book)
    params.append(limit)
    sql = f"""
        SELECT slug, label, pdf_page, printed_page,
               snippet(pages, 4, '[[', ']]', ' ... ', 16) AS snippet,
               bm25(pages) AS score
        FROM pages WHERE {where} ORDER BY score LIMIT ?
    """
    try:
        rows = con.execute(sql, params).fetchall()
        return [dict(r) for r in rows]
    finally:
        con.close()


def list_books(db_path: Path | None = None,
               slug_order: list[str] | None = None) -> list[dict]:
    path = db_path or config.db_path()
    con = sqlite3.connect(path)
    con.row_factory = sqlite3.Row
    try:
        books = con.execute("SELECT slug, label FROM books").fetchall()
        max_pages = dict(
            con.execute("SELECT slug, MAX(printed_page) FROM pages GROUP BY slug")
        )
    finally:
        con.close()
    slugs = slug_order if slug_order is not None else config.manifest().slugs
    order = {slug: i for i, slug in enumerate(slugs)}
    items = [
        {"slug": row["slug"], "label": row["label"],
         "pages": max_pages.get(row["slug"]) or 0}
        for row in books
    ]
    items.sort(key=lambda b: order.get(b["slug"], len(slugs)))
    return items
