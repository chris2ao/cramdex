import json
import sys
from pathlib import Path

from fastapi.testclient import TestClient

import main
from tests.test_pack_config import VALID, make_pack

REPO_ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(REPO_ROOT / "scripts"))

SEED = {
    "version": 1,
    "entries": [{
        "term": "Demo Cycle",
        "definition": "Six-phase lifecycle.",
        "citations": [{"slug": "book1", "label": "Book 1", "page": 3}],
        "topic": "Demo Cycle",
    }],
}


def test_seed_served_from_pack_root(tmp_path, monkeypatch):
    pack = make_pack(tmp_path, monkeypatch, VALID)
    (pack / "index-seed.json").write_text(json.dumps(SEED), encoding="utf-8")
    body = TestClient(main.app).get("/api/content/index-seed").json()
    assert body == SEED


def test_seed_404_when_absent(tmp_path, monkeypatch):
    make_pack(tmp_path, monkeypatch, VALID)
    assert TestClient(main.app).get("/api/content/index-seed").status_code == 404


def test_seed_422_on_invalid_json(tmp_path, monkeypatch):
    pack = make_pack(tmp_path, monkeypatch, VALID)
    (pack / "index-seed.json").write_text("{not json", encoding="utf-8")
    resp = TestClient(main.app).get("/api/content/index-seed")
    assert resp.status_code == 422
    assert "index-seed.json" in resp.json()["detail"]


def test_seed_422_on_wrong_shape(tmp_path, monkeypatch):
    pack = make_pack(tmp_path, monkeypatch, VALID)
    (pack / "index-seed.json").write_text('{"version": 1}', encoding="utf-8")
    assert TestClient(main.app).get("/api/content/index-seed").status_code == 422


def test_seed_422_on_top_level_array(tmp_path, monkeypatch):
    pack = make_pack(tmp_path, monkeypatch, VALID)
    (pack / "index-seed.json").write_text(
        json.dumps([{"term": "Demo Cycle"}]), encoding="utf-8")
    assert TestClient(main.app).get("/api/content/index-seed").status_code == 422


def test_demo_pack_ships_a_valid_seed():
    import demo_content
    doc = json.loads(demo_content.PACK_FILES["index-seed.json"])
    assert doc["version"] == 1
    assert len(doc["entries"]) >= 6
    for entry in doc["entries"]:
        assert entry["term"]
        assert entry["citations"]
        for cite in entry["citations"]:
            assert cite["slug"] in {"book1", "book2", "workbook"}
            assert 1 <= cite["page"] <= 8
