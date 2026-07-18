import textwrap
from pathlib import Path

import pytest

import config
import pages
from tests.test_pack_config import VALID, make_pack


def _fake_runner_factory(created: list):
    def fake_run(cmd, capture_output, text, timeout):
        # pdftoppm ... -singlefile <src> <out_prefix>: create <out_prefix>.png
        out_prefix = Path(cmd[-1])
        out_prefix.parent.mkdir(parents=True, exist_ok=True)
        (out_prefix.with_suffix(".png")).write_bytes(b"\x89PNG fake")
        created.append(cmd)
        class R: returncode = 0; stderr = ""
        return R()
    return fake_run


def test_render_page_builds_correct_command(fixture_db, tmp_path, monkeypatch):
    make_pack(tmp_path, monkeypatch, VALID)
    monkeypatch.setenv("CRAMDEX_PDF_PASSWORD", "pw123")
    books_dir = tmp_path / "books"
    books_dir.mkdir()
    monkeypatch.setenv("CRAMDEX_BOOKS_DIR", str(books_dir))
    (books_dir / "Demo Course - Book 1.pdf").write_bytes(b"%PDF fake")
    calls: list = []
    out = pages.render_page("book1", 70, db_path=fixture_db,
                            runner=_fake_runner_factory(calls))
    assert out.name == "book1-p0070.png"
    cmd = calls[0]
    assert cmd[:3] == ["pdftoppm", "-upw", "pw123"]
    # printed 70 + offset 2 = pdf page 72
    assert cmd[cmd.index("-f") + 1] == "72" and cmd[cmd.index("-l") + 1] == "72"


def test_render_page_serves_from_cache(tmp_path, monkeypatch, fixture_db):
    make_pack(tmp_path, monkeypatch, VALID)
    cached = config.pages_cache_dir() / "book1-p0070.png"
    cached.parent.mkdir(parents=True)
    cached.write_bytes(b"cached")
    def exploding_runner(*a, **k):
        raise AssertionError("must not render when cached")
    assert pages.render_page("book1", 70, db_path=fixture_db,
                             runner=exploding_runner) == cached


def test_render_page_unknown_book_raises_404(tmp_path, monkeypatch, fixture_db):
    make_pack(tmp_path, monkeypatch, VALID)
    with pytest.raises(pages.PageError) as exc:
        pages.render_page("book9", 1, db_path=fixture_db)
    assert exc.value.status == 404


def test_render_page_missing_password_raises_503(fixture_db, tmp_path, monkeypatch):
    """VALID has no `encrypted` key, so Manifest.encrypted defaults to True:
    a pack with no password configured must still raise the actionable
    503, matching every pack that predates the `encrypted` field."""
    make_pack(tmp_path, monkeypatch, VALID)
    monkeypatch.delenv("CRAMDEX_PDF_PASSWORD", raising=False)
    books_dir = tmp_path / "books"
    books_dir.mkdir()
    monkeypatch.setenv("CRAMDEX_BOOKS_DIR", str(books_dir))
    (books_dir / "Demo Course - Book 1.pdf").write_bytes(b"%PDF fake")
    with pytest.raises(pages.PageError) as exc:
        pages.render_page("book1", 70, db_path=fixture_db)
    assert exc.value.status == 503
    assert "password" in exc.value.detail.lower()


def test_render_page_unencrypted_pack_skips_password_and_omits_upw(
        fixture_db, tmp_path, monkeypatch):
    """course.yaml: encrypted: false skips the password pre-check entirely
    and never passes -upw to pdftoppm, since there is nothing to unlock."""
    make_pack(tmp_path, monkeypatch,
              textwrap.dedent(VALID) + "encrypted: false\n")
    monkeypatch.delenv("CRAMDEX_PDF_PASSWORD", raising=False)
    books_dir = tmp_path / "books"
    books_dir.mkdir()
    monkeypatch.setenv("CRAMDEX_BOOKS_DIR", str(books_dir))
    (books_dir / "Demo Course - Book 1.pdf").write_bytes(b"%PDF fake")
    calls: list = []
    out = pages.render_page("book1", 70, db_path=fixture_db,
                            runner=_fake_runner_factory(calls))
    assert out.name == "book1-p0070.png"
    cmd = calls[0]
    assert cmd[0] == "pdftoppm"
    assert "-upw" not in cmd


def test_render_page_missing_db_raises_503_without_creating_file(tmp_path, monkeypatch):
    make_pack(tmp_path, monkeypatch, VALID)
    missing = tmp_path / "nope" / "corpus.db"
    missing.parent.mkdir()
    with pytest.raises(pages.PageError) as exc:
        pages.render_page("book1", 70, db_path=missing)
    assert exc.value.status == 503
    assert not missing.exists()
