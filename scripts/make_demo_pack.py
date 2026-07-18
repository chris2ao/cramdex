#!/usr/bin/env python3
"""
make_demo_pack.py: Build the fictional MOON-101 demo course pack.

Writes a complete, self-contained course pack (three generated PDFs, glossary,
frameworks, acronyms, slide index, notes, and lab workbook files) so the app
can be tried end to end with no real courseware on hand. The generated
content is entirely fictional (see scripts/demo_content.py).

Creates $CRAMDEX_HOME/courses/demo/ (default ~/.cramdex/courses/demo/) and
sets active_course: demo in $CRAMDEX_HOME/config.yaml, preserving any
existing keys (e.g. an llm: block) in that file. Refuses to overwrite an
existing demo pack unless --force is given, in which case only the demo
pack directory is deleted and rebuilt; other courses and other config keys
are left untouched. Existing values in config.yaml survive this rewrite,
but any comments in that file do not: it round-trips through yaml.safe_load
/ yaml.safe_dump, which is comment-blind.

Usage:
    python3 scripts/make_demo_pack.py [--force]
"""
from __future__ import annotations

import argparse
import os
import shutil
import sys
from pathlib import Path

import yaml

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import demo_content
import pdf_writer


def fail(msg: str) -> None:
    print(f"ERROR: {msg}", file=sys.stderr)
    sys.exit(1)


def _cramdex_home() -> Path:
    return Path(os.environ.get("CRAMDEX_HOME", str(Path.home() / ".cramdex")))


def build_demo_pack(home: Path, force: bool = False) -> Path:
    """Write the demo course pack under home/courses/demo and point
    home/config.yaml at it. Returns the pack directory.
    """
    pack = home / "courses" / "demo"
    if pack.exists():
        if not force:
            fail(
                f"demo pack already exists: {pack}\n"
                "Run with --force to delete and rebuild it."
            )
        shutil.rmtree(pack)

    books_dir = pack / "books"
    books_dir.mkdir(parents=True, exist_ok=True)

    for book in demo_content.BOOKS:
        pdf_writer.write_pdf(books_dir / book["filename"], book["pages"])

    for rel, content in demo_content.PACK_FILES.items():
        dest = pack / rel
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_text(content, encoding="utf-8")

    course = {
        "name": demo_content.COURSE_NAME,
        # The generated demo PDFs (pdf_writer.write_pdf) are never
        # encrypted, so no password is needed to extract text or render
        # page images from them. app/server/config.py's Manifest.encrypted
        # field (course.yaml's `encrypted` key) tells the server that, so
        # its /api/health "pdf_password" check and pages.py's render
        # endpoint both skip the password requirement for this pack.
        "encrypted": False,
        "books_dir": str(books_dir.resolve()),
        "books": [
            {"slug": b["slug"], "label": b["label"], "filename": b["filename"]}
            for b in demo_content.BOOKS
        ],
    }
    (pack / "course.yaml").write_text(
        yaml.safe_dump(course, sort_keys=False), encoding="utf-8")

    config_path = home / "config.yaml"
    if config_path.is_file():
        data = yaml.safe_load(config_path.read_text(encoding="utf-8")) or {}
        if not isinstance(data, dict):
            fail(f"{config_path} must be a YAML mapping")
    else:
        data = {}
    data["active_course"] = "demo"
    config_path.write_text(yaml.safe_dump(data, sort_keys=False), encoding="utf-8")

    return pack


def main() -> None:
    ap = argparse.ArgumentParser(
        description="Build the fictional MOON-101 demo course pack.")
    ap.add_argument("--force", action="store_true",
                     help="delete and rebuild an existing demo pack")
    args = ap.parse_args()

    home = _cramdex_home()
    pack = build_demo_pack(home, force=args.force)

    print(f"Demo pack ready: {pack}")
    print(f"  {len(demo_content.BOOKS)} books written to {pack / 'books'}")
    print(f"  active_course: demo set in {home / 'config.yaml'}")
    print("  (note: existing config.yaml values are preserved, but any "
          "comments in that file are not: it's rewritten via a YAML "
          "round-trip)")
    print()
    print("Next steps:")
    print("  bash scripts/build.sh")
    print("  bash app/run.sh")


if __name__ == "__main__":
    main()
