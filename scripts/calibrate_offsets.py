#!/usr/bin/env python3
"""
calibrate_offsets.py: Detect the printed-page offset for each book.

Course PDFs often carry a printed page number that differs from the PDF's
sequential page index (front matter shifts it). The open-book exam index must
cite the PRINTED page a student flips to, so we compute per-book:

    offset = pdf_page - printed_page   (assumed constant within a book)

and write it into .corpus/manifest.tsv. build_index_db.py then stores
printed_page = pdf_page - offset for every page.

Detection tries two page-number locations:
  1. Header/footer: a pack-configured regex, `page_header_pattern` in
     course.yaml, with one capture group for the printed page number.
  2. Footer fallback: a standalone integer near the end of the page.
The most common (pdf_page - N) across all detected pages wins.

Usage:  python3 scripts/calibrate_offsets.py
"""

import collections
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from pack_manifest import pack_dir, raw_course, split_pages

CORPUS = os.path.join(str(pack_dir()), ".corpus")
TEXT_DIR = os.path.join(CORPUS, "text")
MANIFEST = os.path.join(CORPUS, "manifest.tsv")

_pattern = raw_course(pack_dir()).get("page_header_pattern")
if _pattern:
    try:
        HEADER_RE = re.compile(_pattern)
    except re.error as e:
        sys.exit(f"ERROR: invalid page_header_pattern in course.yaml: {e}")
else:
    HEADER_RE = None
STANDALONE_NUM_RE = re.compile(r"^\s*(\d{1,4})\s*$")


def detect_printed(page_text):
    """Return the printed page number found on a page, or None."""
    if HEADER_RE is not None:
        m = HEADER_RE.search(page_text)
        if m:
            return int(m.group(1))
    lines = [l for l in page_text.splitlines() if l.strip()]
    for line in reversed(lines[-6:]):
        m = STANDALONE_NUM_RE.match(line)
        if m:
            return int(m.group(1))
    return None


def book_offset(text_path):
    text = open(text_path, encoding="utf-8", errors="replace").read()
    pages = split_pages(text)
    offsets = collections.Counter()
    for pdf_page, page in enumerate(pages, start=1):
        printed = detect_printed(page)
        if printed is not None:
            offsets[pdf_page - printed] += 1
    if not offsets:
        return None, 0, len(pages)
    offset, hits = offsets.most_common(1)[0]
    return offset, hits, len(pages)


def main():
    if not os.path.isfile(MANIFEST):
        sys.exit(f"ERROR: manifest not found: {MANIFEST}\nRun scripts/extract.sh first.")

    with open(MANIFEST, encoding="utf-8") as f:
        header = f.readline().rstrip("\n").split("\t")
        rows = [dict(zip(header, l.rstrip("\n").split("\t")))
                for l in f if l.strip()]

    for row in rows:
        slug = row["slug"]
        path = os.path.join(TEXT_DIR, f"{slug}.txt")
        if not os.path.isfile(path):
            print(f"  WARN: no text for {slug}", file=sys.stderr)
            continue
        offset, hits, npages = book_offset(path)
        if offset is None:
            print(f"  {row['label']:10s} no page numbers detected, keeping offset 0")
            row["offset"] = "0"
        else:
            confidence = hits / npages if npages else 0
            row["offset"] = str(offset)
            flag = "" if confidence >= 0.4 else "  (LOW confidence, verify!)"
            print(f"  {row['label']:10s} offset={offset:3d}  "
                  f"({hits}/{npages} pages, {confidence:.0%}){flag}")

    with open(MANIFEST, "w", encoding="utf-8") as f:
        f.write("\t".join(header) + "\n")
        for row in rows:
            f.write("\t".join(row[h] for h in header) + "\n")

    print(f"\nUpdated offsets in {MANIFEST}")


if __name__ == "__main__":
    main()
