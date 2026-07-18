"""split_pages: shared page-splitting helper used by every pipeline script.

poppler's pdftotext emits a trailing form-feed (\\f) after the final page on
some builds (verified with poppler 26.07's pdftotext, see
test_demo_generator.py::test_pdftotext_roundtrips_lines_and_pages) but not
necessarily all of them. That extra \\f produces one bogus empty trailing
page per book when text.split("\\f") is used directly. split_pages() drops
exactly one trailing empty/whitespace segment so the page count agrees
whether or not the trailing form feed was present, without ever touching a
genuine empty page earlier in the book.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[3] / "scripts"))

import pack_manifest


def test_split_pages_drops_single_trailing_empty_from_trailing_ff():
    text = "Page one text\fPage two text\f"
    assert pack_manifest.split_pages(text) == ["Page one text", "Page two text"]


def test_split_pages_without_trailing_ff_yields_same_count():
    text = "Page one text\fPage two text"
    assert pack_manifest.split_pages(text) == ["Page one text", "Page two text"]


def test_split_pages_drops_only_one_trailing_empty_even_with_whitespace():
    # A trailing FF followed only by whitespace (no more content) is still
    # the poppler artifact, not a real page.
    text = "Page one\fPage two\f  \n "
    assert pack_manifest.split_pages(text) == ["Page one", "Page two"]


def test_split_pages_preserves_real_empty_page_mid_book():
    text = "Page one\f\fPage three"
    assert pack_manifest.split_pages(text) == ["Page one", "", "Page three"]


def test_split_pages_single_page_no_ff():
    text = "Only page, no form feed at all"
    assert pack_manifest.split_pages(text) == ["Only page, no form feed at all"]


def test_split_pages_empty_string_yields_one_empty_page():
    # No FF at all means len(pages) == 1: the lone page is never dropped
    # even if it happens to be empty (an empty file is not the trailing-FF
    # artifact this helper targets).
    assert pack_manifest.split_pages("") == [""]
