"""Render book pages to PNG on demand, cached under .corpus/pages/."""
from __future__ import annotations

import sqlite3
import subprocess
from pathlib import Path

import config


class PageError(Exception):
    def __init__(self, status: int, detail: str):
        super().__init__(detail)
        self.status = status
        self.detail = detail


def _book_row(slug: str, db_path: Path | None) -> sqlite3.Row:
    path = db_path or config.db_path()
    if not Path(path).is_file():
        raise PageError(503, "Corpus index not found. Run scripts/build.sh.")
    con = sqlite3.connect(path)
    con.row_factory = sqlite3.Row
    try:
        row = con.execute("SELECT * FROM books WHERE slug = ?", (slug,)).fetchone()
    finally:
        con.close()
    if row is None:
        raise PageError(404, f"Unknown book: {slug}")
    return row


def render_page(
    slug: str,
    printed_page: int,
    *,
    db_path: Path | None = None,
    runner=subprocess.run,
) -> Path:
    out = config.pages_cache_dir() / f"{slug}-p{printed_page:04d}.png"
    if out.is_file():
        return out

    book = _book_row(slug, db_path)
    pdf_page = printed_page + int(book["offset"])
    if not 1 <= pdf_page <= int(book["pdf_pages"]):
        raise PageError(404, f"Page {printed_page} out of range for {slug}")

    src = config.books_dir() / book["source_filename"]
    if not src.is_file():
        raise PageError(503, f"Source PDF not reachable: {src.name}")
    password = config.pdf_password()
    if password is None and config.manifest().encrypted:
        raise PageError(503, "Courseware password not configured (set "
                             "CRAMDEX_PDF_PASSWORD or the pack's "
                             ".corpus/.pdf_password)")

    out.parent.mkdir(parents=True, exist_ok=True)
    cmd = ["pdftoppm"]
    if password is not None:
        cmd += ["-upw", password]
    cmd += [
        "-f", str(pdf_page), "-l", str(pdf_page),
        "-r", "150", "-png", "-singlefile",
        str(src), str(out.with_suffix("")),
    ]
    try:
        result = runner(cmd, capture_output=True, text=True, timeout=60)
    except FileNotFoundError as exc:
        raise PageError(503, "pdftoppm not found (brew install poppler)") from exc
    except subprocess.TimeoutExpired as exc:
        raise PageError(503, "Page render timed out") from exc
    if result.returncode != 0 or not out.is_file():
        raise PageError(503, f"Render failed: {result.stderr.strip()[:200]}")
    return out
