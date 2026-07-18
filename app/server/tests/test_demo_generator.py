"""Demo generator: valid PDFs pdftotext can read; content shape sane."""
import os
import shutil
import sqlite3
import subprocess
import sys
from pathlib import Path

import pytest
import yaml

REPO_ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(REPO_ROOT / "scripts"))

import demo_content
import pdf_writer

needs_poppler = pytest.mark.skipif(
    shutil.which("pdftotext") is None, reason="poppler not installed")


def test_write_pdf_emits_valid_header_and_eof(tmp_path):
    out = tmp_path / "t.pdf"
    pdf_writer.write_pdf(out, [["Hello world", "1"]])
    data = out.read_bytes()
    assert data.startswith(b"%PDF-1.4")
    assert data.rstrip().endswith(b"%%EOF")


@needs_poppler
def test_pdftotext_roundtrips_lines_and_pages(tmp_path):
    out = tmp_path / "t.pdf"
    pdf_writer.write_pdf(out, [["Alpha line", "Beta (with parens)", "1"],
                               ["Second page", "2"]])
    txt = tmp_path / "t.txt"
    subprocess.run(["pdftotext", "-layout", str(out), str(txt)], check=True)
    text = txt.read_text()
    assert "Alpha line" in text and "Beta (with parens)" in text
    # This installed poppler build (26.07.0) emits a trailing form feed after
    # the final page too, verified independently with a non-generated PDF
    # (cupsfilter output), so two pages produce two form feeds, not one.
    assert text.count("\f") == 2  # two pages -> two form feeds (this poppler)


def test_books_shape_and_page_numbers():
    assert len(demo_content.BOOKS) == 3
    slugs = [b["slug"] for b in demo_content.BOOKS]
    assert slugs == ["book1", "book2", "workbook"]
    for book in demo_content.BOOKS:
        assert len(book["pages"]) >= 6
        for i, page in enumerate(book["pages"], start=1):
            assert page[-1] == str(i)  # standalone printed page number


def test_pack_files_cover_every_optional_feature():
    keys = set(demo_content.PACK_FILES)
    for required in ("topics.yaml", "glossary.md", "frameworks.md",
                     "acronyms.md", "slide-index.md", "notes/orientation.md",
                     "labs/workbook/lab-1.1.md",
                     "labs/workbook/lab-1.2-comparison.md"):
        assert required in keys


def test_glossary_terms_appear_in_book_pages():
    all_text = "\n".join("\n".join(line for page in b["pages"] for line in page)
                          for b in demo_content.BOOKS)
    assert "Regolith Sweep" in all_text  # searchable glossary anchor term


def test_build_demo_pack_writes_everything(tmp_path):
    from make_demo_pack import build_demo_pack
    pack = build_demo_pack(tmp_path)
    assert (pack / "course.yaml").is_file()
    for rel in demo_content.PACK_FILES:
        assert (pack / rel).is_file()
    books = list((pack / "books").glob("*.pdf"))
    assert len(books) == 3
    cfg = (tmp_path / "config.yaml").read_text()
    assert "active_course: demo" in cfg


def test_build_demo_pack_marks_unencrypted_with_no_password_file(tmp_path):
    """The demo pack's PDFs are never encrypted (pdf_writer.write_pdf), so
    course.yaml must say so and the pack must not carry a password file:
    the server should need no password at all to render its pages."""
    from make_demo_pack import build_demo_pack
    pack = build_demo_pack(tmp_path)
    course = yaml.safe_load((pack / "course.yaml").read_text(encoding="utf-8"))
    assert course["encrypted"] is False
    assert not (pack / ".corpus" / ".pdf_password").exists()


def test_build_demo_pack_preserves_existing_config(tmp_path):
    (tmp_path / "config.yaml").write_text(
        "llm:\n  provider: claude_cli\n", encoding="utf-8")
    from make_demo_pack import build_demo_pack
    build_demo_pack(tmp_path)
    cfg = (tmp_path / "config.yaml").read_text()
    assert "provider: claude_cli" in cfg and "active_course: demo" in cfg


def test_build_demo_pack_refuses_overwrite_without_force(tmp_path):
    from make_demo_pack import build_demo_pack
    build_demo_pack(tmp_path)
    with pytest.raises(SystemExit):
        build_demo_pack(tmp_path)
    build_demo_pack(tmp_path, force=True)  # succeeds


@needs_poppler
def test_full_pipeline_pdf_pages_match_demo_content(tmp_path):
    """End-to-end regression for the trailing-form-feed page-count bug: run
    the real extract -> calibrate -> index pipeline (scripts/build.sh) over
    a freshly built demo pack in an isolated CRAMDEX_HOME, then assert the
    indexed books.pdf_pages equals the actual page count of each book in
    demo_content.BOOKS. Before the split_pages() fix this poppler build
    reported one extra page per book (see p3-task-2-report.md)."""
    from make_demo_pack import build_demo_pack

    home = tmp_path / "cramdex-home"
    build_demo_pack(home)

    env = dict(os.environ)
    env["CRAMDEX_HOME"] = str(home)
    result = subprocess.run(
        ["bash", str(REPO_ROOT / "scripts" / "build.sh")],
        env=env, capture_output=True, text=True,
    )
    assert result.returncode == 0, result.stdout + result.stderr

    db_path = home / "courses" / "demo" / ".corpus" / "corpus.db"
    con = sqlite3.connect(db_path)
    rows = dict(con.execute("SELECT slug, pdf_pages FROM books").fetchall())
    con.close()

    expected = {b["slug"]: len(b["pages"]) for b in demo_content.BOOKS}
    assert rows == expected
