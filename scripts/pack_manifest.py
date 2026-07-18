#!/usr/bin/env python3
"""Resolve the active course pack for pipeline scripts.

Usage:
    pack_manifest.py dir         print the pack directory
    pack_manifest.py books-dir   print the source PDF directory
    pack_manifest.py books       print TSV: slug<TAB>label<TAB>filename
    pack_manifest.py option KEY  print a top-level course.yaml string value
"""
import os
import sys
from pathlib import Path

import yaml


def fail(msg):
    print(f"ERROR: {msg}", file=sys.stderr)
    sys.exit(1)


def split_pages(text: str) -> list[str]:
    """Split pdftotext output into pages on the form-feed (\\f) delimiter.

    Some poppler builds (verified with pdftotext from poppler 26.07) emit a
    trailing form feed after the final page's text, which would otherwise
    leave one bogus empty page at the end of every book. Drop exactly one
    trailing empty/whitespace-only segment so the page count agrees whether
    or not that trailing form feed was present. A genuinely empty page
    earlier in the book, or a single-page file with no form feed at all, is
    never touched: only the last segment is ever a drop candidate, and at
    most one is dropped.
    """
    pages = text.split("\f")
    if len(pages) > 1 and not pages[-1].strip():
        pages = pages[:-1]
    return pages


def cramdex_home() -> Path:
    return Path(os.environ.get("CRAMDEX_HOME", str(Path.home() / ".cramdex")))


def pack_dir() -> Path:
    cfg = cramdex_home() / "config.yaml"
    if not cfg.is_file():
        fail(f"no config found: {cfg} (run the setup wizard)")
    data = yaml.safe_load(cfg.read_text(encoding="utf-8")) or {}
    slug = data.get("active_course") if isinstance(data, dict) else None
    if not slug:
        fail(f"no active_course set in {cfg}")
    d = cramdex_home() / "courses" / str(slug)
    if not (d / "course.yaml").is_file():
        fail(f"course pack not found: {d}")
    return d


def raw_course(pack: Path) -> dict:
    data = yaml.safe_load((pack / "course.yaml").read_text(encoding="utf-8"))
    if not isinstance(data, dict):
        fail(f"{pack / 'course.yaml'} must be a YAML mapping")
    return data


def main():
    cmd = sys.argv[1] if len(sys.argv) > 1 else "dir"
    pack = pack_dir()
    data = raw_course(pack)
    if cmd == "dir":
        print(pack)
    elif cmd == "books-dir":
        bd = os.environ.get("CRAMDEX_BOOKS_DIR") or data.get("books_dir")
        if not bd:
            fail("no books_dir in course.yaml (or set CRAMDEX_BOOKS_DIR)")
        print(os.path.expanduser(str(bd)))
    elif cmd == "books":
        books = data.get("books") or []
        if not books:
            fail("course.yaml has no books")
        for b in books:
            if not isinstance(b, dict) or not all(b.get(k) for k in ("slug", "label", "filename")):
                fail("course.yaml book entries need slug, label, filename")
            print(f"{b['slug']}\t{b['label']}\t{b['filename']}")
    elif cmd == "option":
        if len(sys.argv) < 3:
            fail("usage: pack_manifest.py option KEY")
        val = data.get(sys.argv[2])
        print("" if val is None else str(val))
    else:
        fail(f"unknown command: {cmd}")


if __name__ == "__main__":
    main()
