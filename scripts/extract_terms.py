#!/usr/bin/env python3
"""
extract_terms.py: Auto-extract candidate index terms from the corpus.

Produces a first-pass, page-accurate set of index anchors for the open-book
exam index:
  * Slide/section TITLES:  one per page (the natural index backbone)
  * ACRONYMS + expansions, e.g. "DEMO-CYCLE (Preparation, Identification, ...)"

Output is written to .corpus/ (gitignored) as TSV that feeds index
suggestions. Raw extraction is intentionally generous; a human curates it
into the final index.

Usage:
    python3 scripts/extract_terms.py
    # -> .corpus/titles.tsv     (book, printed_page, pdf_page, title)
    # -> .corpus/acronyms.tsv   (acronym, expansion, book, printed_page)
"""

import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from pack_manifest import pack_dir, raw_course, split_pages

CORPUS = os.path.join(str(pack_dir()), ".corpus")
TEXT_DIR = os.path.join(CORPUS, "text")
MANIFEST = os.path.join(CORPUS, "manifest.tsv")

# Lines that are page furniture, not content.
_BASE_NOISE = [
    re.compile(r"^[0-9a-f]{24,}"),               # per-doc hex watermark
    re.compile(r"Licensed To", re.I),
    re.compile(r"All rights reserved", re.I),
    re.compile(r"TERMS AND CONDITIONS|COURSEWARE LICENSE"),
    re.compile(r"^\W*$"),                        # punctuation-only
]
_extra = raw_course(pack_dir()).get("noise_patterns") or []
NOISE_PATTERNS = list(_BASE_NOISE)
for _p in _extra:
    try:
        NOISE_PATTERNS.append(re.compile(_p, re.I))
    except re.error as e:
        sys.exit(f"ERROR: invalid noise_patterns entry {_p!r} in course.yaml: {e}")

ACRONYM_AFTER = re.compile(r"\b([A-Z][A-Za-z]?[A-Z]{1,6})\b\s*\(([^)]{4,90})\)")
ACRONYM_BEFORE = re.compile(r"\b([A-Z][a-z][^()]{6,80}?)\s*\(([A-Z]{2,7})\)")


def is_noise(line):
    s = line.strip()
    if len(s) < 10:                 # margin bleed / fragments / page numbers
        return True
    return any(p.search(s) for p in NOISE_PATTERNS)


def load_manifest():
    with open(MANIFEST, encoding="utf-8") as f:
        header = f.readline().rstrip("\n").split("\t")
        return [dict(zip(header, l.rstrip("\n").split("\t")))
                for l in f if l.strip()]


def clean_title(line):
    """Cut margin/column bleed and tidy a candidate title line."""
    s = line.strip()
    # -layout separates columns/margins with runs of 2+ spaces; the slide
    # title is the first column, so cut at the first big gap to drop bleed.
    s = re.split(r"\s{2,}", s)[0].strip()
    s = s.rstrip(" .,:;—-")
    return s


def page_title(page_text):
    """Best slide/section title on a page.

    Prefer the first title-cased line (starts with an uppercase letter, digit,
    or bullet); fall back to the first content line. Filters page furniture and
    obvious mid-sentence body text.
    """
    fallback = None
    for raw in page_text.splitlines():
        if is_noise(raw):
            continue
        title = clean_title(raw)
        if not (10 <= len(title) <= 90):
            continue
        if is_noise(title):
            continue
        if fallback is None:
            fallback = title
        # A good title starts with uppercase/number/bullet, not mid-sentence.
        if re.match(r"^[A-Z0-9•\-–]", title):
            return title
    return fallback


def extract():
    if not os.path.isfile(MANIFEST):
        sys.exit("ERROR: run scripts/extract.sh first (no manifest).")

    titles_path = os.path.join(CORPUS, "titles.tsv")
    acr_path = os.path.join(CORPUS, "acronyms.tsv")
    seen_acr = {}
    n_titles = 0

    with open(titles_path, "w", encoding="utf-8") as tf:
        tf.write("book\tprinted_page\tpdf_page\ttitle\n")
        for book in load_manifest():
            slug, label = book["slug"], book["label"]
            offset = int(book.get("offset", "0") or "0")
            path = os.path.join(TEXT_DIR, f"{slug}.txt")
            if not os.path.isfile(path):
                continue
            text = open(path, encoding="utf-8", errors="replace").read()
            pages = split_pages(text)
            for pdf_page, page in enumerate(pages, start=1):
                printed = pdf_page - offset
                title = page_title(page)
                if title:
                    tf.write(f"{label}\t{printed}\t{pdf_page}\t{title}\n")
                    n_titles += 1
                # Acronyms: keep first occurrence (earliest page) per acronym.
                for rx, order in ((ACRONYM_AFTER, "af"), (ACRONYM_BEFORE, "be")):
                    for m in rx.finditer(page):
                        acr = m.group(1) if order == "af" else m.group(2)
                        exp = m.group(2) if order == "af" else m.group(1)
                        acr, exp = acr.strip(), re.sub(r"\s{2,}", " ", exp.strip())
                        if 2 <= len(acr) <= 7 and acr not in seen_acr:
                            seen_acr[acr] = (exp, label, printed)

    with open(acr_path, "w", encoding="utf-8") as af:
        af.write("acronym\texpansion\tbook\tprinted_page\n")
        for acr in sorted(seen_acr):
            exp, label, printed = seen_acr[acr]
            af.write(f"{acr}\t{exp}\t{label}\t{printed}\n")

    print(f"Wrote {n_titles} title rows      -> {titles_path}")
    print(f"Wrote {len(seen_acr)} acronyms   -> {acr_path}")


if __name__ == "__main__":
    extract()
