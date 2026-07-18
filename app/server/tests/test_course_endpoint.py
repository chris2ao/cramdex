"""/api/course and PackError handling."""
from fastapi.testclient import TestClient

import main
from tests.test_pack_config import make_pack, VALID


def test_course_endpoint(tmp_path, monkeypatch):
    make_pack(tmp_path, monkeypatch, VALID)
    client = TestClient(main.app)
    body = client.get("/api/course").json()
    assert body["name"] == "Demo Course"
    assert [b["slug"] for b in body["books"]] == ["book1", "workbook"]


def test_no_pack_returns_503(tmp_path, monkeypatch):
    monkeypatch.setenv("CRAMDEX_HOME", str(tmp_path / "nothing"))
    client = TestClient(main.app)
    resp = client.get("/api/course")
    assert resp.status_code == 503
    assert "course" in resp.json()["detail"].lower()


def test_notes_endpoint(tmp_path, monkeypatch):
    pack = make_pack(tmp_path, monkeypatch, VALID)
    notes = pack / "notes"
    notes.mkdir()
    (notes / "alpha.md").write_text("# Alpha Notes\nbody\n", encoding="utf-8")
    client = TestClient(main.app)
    items = client.get("/api/content/notes").json()["items"]
    assert items == [{"title": "Alpha Notes", "path": "notes/alpha.md"}]
