#!/usr/bin/env python3
"""
build_index_db.py: Build a SQLite FTS5 full-text search index over the
extracted course book text.

Reads .corpus/manifest.tsv and the per-book text files in .corpus/text/,
splits each book into pages on the form-feed (\\f) delimiter that pdftotext
emits, and inserts one row per page into an FTS5 virtual table. This is the
retrieval layer: ranked (BM25) full-text search with exact book + page
citations, using only the stock macOS sqlite3 (no ML dependencies).

The database (.corpus/corpus.db) holds copyrighted courseware text and is
gitignored. Rebuild any time with: scripts/build.sh

Usage:
    python3 scripts/build_index_db.py
"""

import os
import sqlite3
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from pack_manifest import pack_dir, split_pages

CORPUS = os.path.join(str(pack_dir()), ".corpus")
TEXT_DIR = os.path.join(CORPUS, "text")
MANIFEST = os.path.join(CORPUS, "manifest.tsv")
DB_PATH = os.path.join(CORPUS, "corpus.db")


def read_manifest():
    """Return list of dicts: slug, label, source_filename, pdf_pages, offset."""
    if not os.path.isfile(MANIFEST):
        sys.exit(f"ERROR: manifest not found: {MANIFEST}\nRun scripts/extract.sh first.")
    rows = []
    with open(MANIFEST, encoding="utf-8") as f:
        header = f.readline().rstrip("\n").split("\t")
        for line in f:
            if not line.strip():
                continue
            vals = line.rstrip("\n").split("\t")
            rows.append(dict(zip(header, vals)))
    return rows


def load_pages(slug):
    """Yield (pdf_page, text) for each page in a book's extracted text file."""
    path = os.path.join(TEXT_DIR, f"{slug}.txt")
    if not os.path.isfile(path):
        print(f"  WARN: missing text file for {slug}: {path}", file=sys.stderr)
        return
    with open(path, encoding="utf-8", errors="replace") as f:
        content = f.read()
    # pdftotext delimits pages with form-feed. split_pages() also drops a
    # single trailing empty page some poppler builds add after the last
    # page, so the page count matches the actual PDF regardless of build.
    pages = split_pages(content)
    for i, page_text in enumerate(pages, start=1):
        yield i, page_text


def build():
    manifest = read_manifest()
    if os.path.exists(DB_PATH):
        os.remove(DB_PATH)

    con = sqlite3.connect(DB_PATH)
    cur = con.cursor()

    # Verify FTS5 is available in this sqlite build.
    try:
        cur.execute("CREATE VIRTUAL TABLE _fts_probe USING fts5(x);")
        cur.execute("DROP TABLE _fts_probe;")
    except sqlite3.OperationalError as e:
        con.close()
        sys.exit(f"ERROR: this sqlite3 lacks FTS5 support: {e}")

    # books: metadata table (plain). pages: FTS5 search table.
    cur.execute("""
        CREATE TABLE books (
            slug TEXT PRIMARY KEY,
            label TEXT,
            source_filename TEXT,
            pdf_pages INTEGER,
            offset INTEGER
        );
    """)
    # Only `text` is indexed for BM25; the rest are UNINDEXED metadata we
    # still filter and display on.
    cur.execute("""
        CREATE VIRTUAL TABLE pages USING fts5(
            slug UNINDEXED,
            label UNINDEXED,
            pdf_page UNINDEXED,
            printed_page UNINDEXED,
            text,
            tokenize = 'porter unicode61'
        );
    """)

    total_pages = 0
    for book in manifest:
        slug = book["slug"]
        label = book["label"]
        offset = int(book.get("offset", "0") or "0")
        cur.execute(
            "INSERT INTO books VALUES (?,?,?,?,?)",
            (slug, label, book.get("source_filename", ""),
             int(book.get("pdf_pages", "0") or "0"), offset),
        )
        n = 0
        for pdf_page, text in load_pages(slug):
            printed = pdf_page - offset  # printed page number a student flips to
            cur.execute(
                "INSERT INTO pages (slug, label, pdf_page, printed_page, text) "
                "VALUES (?,?,?,?,?)",
                (slug, label, pdf_page, printed, text),
            )
            n += 1
        total_pages += n
        print(f"  indexed {label:12s} {n:4d} pages (offset {offset})")

    con.commit()
    con.close()
    print(f"\nBuilt {DB_PATH}")
    print(f"Total: {len(manifest)} books, {total_pages} pages indexed.")


if __name__ == "__main__":
    build()
