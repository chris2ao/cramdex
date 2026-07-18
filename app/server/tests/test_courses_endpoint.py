"""GET /api/courses and POST /api/course/activate: multi-course listing and
switching."""
import yaml
from fastapi.testclient import TestClient

import config
import main
from tests.test_pack_config import make_pack, MALFORMED, VALID


def test_list_courses_endpoint_two_packs_one_malformed(tmp_path, monkeypatch):
    make_pack(tmp_path, monkeypatch, VALID, slug="alpha", active=True)
    make_pack(tmp_path, monkeypatch, MALFORMED, slug="beta", active=False)
    client = TestClient(main.app)
    body = client.get("/api/courses").json()
    assert body == {"items": [
        {"slug": "alpha", "name": "Demo Course", "active": True, "valid": True},
        {"slug": "beta", "name": None, "active": False, "valid": False},
    ]}


def test_activate_course_switches_active(tmp_path, monkeypatch):
    make_pack(tmp_path, monkeypatch, VALID, slug="alpha", active=True)
    make_pack(tmp_path, monkeypatch, VALID, slug="beta", active=False)
    client = TestClient(main.app)
    resp = client.post("/api/course/activate", json={"slug": "beta"})
    assert resp.status_code == 200
    items = resp.json()["items"]
    assert {c["slug"]: c["active"] for c in items} == {
        "alpha": False, "beta": True}
    # persisted for subsequent requests, not just reflected in the response
    follow_up = client.get("/api/courses").json()["items"]
    assert {c["slug"]: c["active"] for c in follow_up} == {
        "alpha": False, "beta": True}


def test_activate_unknown_slug_404(tmp_path, monkeypatch):
    make_pack(tmp_path, monkeypatch, VALID, slug="alpha", active=True)
    client = TestClient(main.app)
    resp = client.post("/api/course/activate", json={"slug": "ghost"})
    assert resp.status_code == 404
    assert "ghost" in resp.json()["detail"]
    assert config.active_course_slug() == "alpha"  # untouched on 404


def test_activate_preserves_other_keys_incl_llm_block(tmp_path, monkeypatch):
    make_pack(tmp_path, monkeypatch, VALID, slug="alpha", active=False)
    make_pack(tmp_path, monkeypatch, VALID, slug="beta", active=False)
    cfg = config.cramdex_home() / "config.yaml"
    cfg.write_text(
        "active_course: alpha\n"
        "llm:\n"
        "  provider: anthropic_api\n"
        "  model: claude-opus-4-8\n",
        encoding="utf-8",
    )
    client = TestClient(main.app)
    resp = client.post("/api/course/activate", json={"slug": "beta"})
    assert resp.status_code == 200
    data = yaml.safe_load(cfg.read_text(encoding="utf-8"))
    assert data["active_course"] == "beta"
    assert data["llm"] == {"provider": "anthropic_api", "model": "claude-opus-4-8"}


def test_list_courses_malformed_home_config_active_false_everywhere(
        tmp_path, monkeypatch):
    make_pack(tmp_path, monkeypatch, VALID, slug="alpha", active=False)
    cfg = config.cramdex_home() / "config.yaml"
    cfg.write_text("active_course: [unclosed", encoding="utf-8")
    client = TestClient(main.app)
    resp = client.get("/api/courses")
    assert resp.status_code == 200
    assert resp.json()["items"] == [
        {"slug": "alpha", "name": "Demo Course", "active": False, "valid": True},
    ]


def test_activate_traversal_slug_returns_404(tmp_path, monkeypatch):
    """Pins the slug-shape guard itself, not merely the sandbox's
    emptiness: a real course.yaml exists at the filesystem location the
    traversal slug resolves to (courses_dir()/"../outside" ==
    cramdex_home()/"outside"), so an is_file()-only pre-check would wrongly
    accept it and 200. This must still 404, with active_course untouched."""
    make_pack(tmp_path, monkeypatch, VALID, slug="alpha", active=True)
    outside = config.cramdex_home() / "outside"
    outside.mkdir()
    (outside / "course.yaml").write_text(VALID, encoding="utf-8")
    client = TestClient(main.app)
    resp = client.post("/api/course/activate", json={"slug": "../outside"})
    assert resp.status_code == 404
    assert config.active_course_slug() == "alpha"  # untouched


def test_list_courses_endpoint_invalid_utf8_sibling_pack(tmp_path, monkeypatch):
    make_pack(tmp_path, monkeypatch, VALID, slug="alpha", active=True)
    bad_pack = config.cramdex_home() / "courses" / "beta"
    bad_pack.mkdir(parents=True)
    (bad_pack / "course.yaml").write_bytes(b"name: X\n\xff\n")
    client = TestClient(main.app)
    resp = client.get("/api/courses")
    assert resp.status_code == 200
    items = {c["slug"]: c for c in resp.json()["items"]}
    assert items["beta"] == {
        "slug": "beta", "name": None, "active": False, "valid": False}


def test_activate_genuinely_broken_home_config_surfaces_503(tmp_path, monkeypatch):
    """The pack itself exists (precheck passes), but config.yaml can't be
    parsed: distinct from a missing pack, this must surface as 503 via the
    global PackError handler, not 404."""
    make_pack(tmp_path, monkeypatch, VALID, slug="alpha", active=False)
    cfg = config.cramdex_home() / "config.yaml"
    cfg.write_text("active_course: [unclosed", encoding="utf-8")
    client = TestClient(main.app)
    resp = client.post("/api/course/activate", json={"slug": "alpha"})
    assert resp.status_code == 503
