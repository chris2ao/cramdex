import textwrap

from fastapi.testclient import TestClient

import main
from tests.test_pack_config import VALID, make_pack


def test_health_reports_all_dependency_keys():
    client = TestClient(main.app)
    body = client.get("/api/health").json()
    assert set(body["checks"].keys()) == {
        "course_pack", "corpus_db", "poppler", "llm",
        "books_dir", "pdf_password",
    }
    assert all(isinstance(v, bool) for v in body["checks"].values())
    assert body["ok"] == all(body["checks"].values())


def test_health_flags_missing_corpus(tmp_path, monkeypatch):
    make_pack(tmp_path, monkeypatch, VALID)
    client = TestClient(main.app)
    body = client.get("/api/health").json()
    assert body["checks"]["course_pack"] is True
    assert body["checks"]["corpus_db"] is False
    assert body["ok"] is False


def test_health_llm_true_when_provider_reports_configured(monkeypatch):
    monkeypatch.setattr("main.get_provider",
                        lambda: type("P", (), {"status": lambda self: {"configured": True}})())
    client = TestClient(main.app)
    body = client.get("/api/health").json()
    assert body["checks"]["llm"] is True


def test_health_pdf_password_true_when_unencrypted(tmp_path, monkeypatch):
    """course.yaml: encrypted: false with no password configured must
    still report pdf_password: True, since nothing needs unlocking."""
    make_pack(tmp_path, monkeypatch,
              textwrap.dedent(VALID) + "encrypted: false\n")
    monkeypatch.delenv("CRAMDEX_PDF_PASSWORD", raising=False)
    client = TestClient(main.app)
    body = client.get("/api/health").json()
    assert body["checks"]["course_pack"] is True
    assert body["checks"]["pdf_password"] is True


def test_health_books_dir_honors_env_override(tmp_path, monkeypatch):
    """health()'s books_dir check derives from the already-loaded manifest
    rather than re-calling config.books_dir() (which would parse
    course.yaml a second time), so the CRAMDEX_BOOKS_DIR override is
    applied by hand in main.py and needs its own pin: a manifest whose own
    books_dir is bogus must still report books_dir: True once the env var
    points at a real directory."""
    bogus_manifest = textwrap.dedent(VALID).replace(
        "books_dir: /tmp/demo-books", "books_dir: /definitely-does-not-exist-xyz")
    make_pack(tmp_path, monkeypatch, bogus_manifest)
    real_books = tmp_path / "real-books"
    real_books.mkdir()
    monkeypatch.setenv("CRAMDEX_BOOKS_DIR", str(real_books))
    client = TestClient(main.app)
    body = client.get("/api/health").json()
    assert body["checks"]["course_pack"] is True
    assert body["checks"]["books_dir"] is True


def test_health_degrades_on_malformed_course_yaml_never_500(tmp_path, monkeypatch):
    """course_pack is True (course.yaml exists, has_pack() only checks the
    file), but its `encrypted` value is malformed, so config.manifest()
    raises PackError inside health(). books_dir and pdf_password must both
    degrade to False (the pack file exists but is broken, so setup is
    still not complete) and the endpoint must return 200, never 500 via
    the app-level PackError exception handler."""
    make_pack(tmp_path, monkeypatch,
              textwrap.dedent(VALID) + "encrypted: maybe\n")
    client = TestClient(main.app)
    resp = client.get("/api/health")
    assert resp.status_code == 200
    body = resp.json()
    assert body["checks"]["course_pack"] is True
    assert body["checks"]["books_dir"] is False
    assert body["checks"]["pdf_password"] is False
    assert body["ok"] is False


def test_health_llm_false_on_malformed_home_config(tmp_path, monkeypatch):
    """A malformed ~/.cramdex/config.yaml makes llm_config() raise PackError;
    health must degrade to llm: False rather than 500."""
    home = tmp_path / "home"
    home.mkdir()
    (home / "config.yaml").write_text("active_course: [unclosed", encoding="utf-8")
    monkeypatch.setenv("CRAMDEX_HOME", str(home))
    client = TestClient(main.app)
    resp = client.get("/api/health")
    assert resp.status_code == 200
    body = resp.json()
    assert body["checks"]["llm"] is False
    assert body["ok"] is False
