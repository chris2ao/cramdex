"""Topic taxonomy: topics.yaml when present, per-book fallback otherwise."""
import textwrap

import pytest

import config
import content
from tests.test_pack_config import make_pack, VALID


def test_fallback_without_topics_yaml(tmp_path, monkeypatch):
    make_pack(tmp_path, monkeypatch, VALID)
    t = content.load_topics(config.pack_dir(), config.manifest())
    assert t["promoted"] == []
    assert t["themes"] == {"Book 1": "Book 1", "Workbook": "Workbook"}
    assert t["fallback"] == "General"
    assert t["order"] == ["Book 1", "Workbook", "General"]


def test_topics_yaml(tmp_path, monkeypatch):
    pack = make_pack(tmp_path, monkeypatch, VALID)
    (pack / "topics.yaml").write_text(textwrap.dedent("""
        promoted:
          - key: DEMO-CYCLE
            label: Demo Cycle
        themes:
          book1: Fundamentals
          nosuchslug: Ignored
        fallback: Misc
    """), encoding="utf-8")
    t = content.load_topics(config.pack_dir(), config.manifest())
    assert t["promoted"] == [{"key": "DEMO-CYCLE", "label": "Demo Cycle"}]
    assert t["themes"] == {"Book 1": "Fundamentals", "Workbook": "Workbook"}
    assert t["fallback"] == "Misc"
    assert t["order"] == ["Demo Cycle", "Fundamentals", "Workbook", "Misc"]


def test_malformed_topics_yaml_raises_pack_error(tmp_path, monkeypatch):
    pack = make_pack(tmp_path, monkeypatch, VALID)
    (pack / "topics.yaml").write_text("promoted: [unclosed", encoding="utf-8")
    with pytest.raises(config.PackError, match="Invalid YAML"):
        content.load_topics(config.pack_dir(), config.manifest())


def test_non_mapping_themes_raises_pack_error(tmp_path, monkeypatch):
    pack = make_pack(tmp_path, monkeypatch, VALID)
    (pack / "topics.yaml").write_text("themes: [a, b]\n", encoding="utf-8")
    with pytest.raises(config.PackError, match="'themes' must be a mapping"):
        content.load_topics(config.pack_dir(), config.manifest())


def test_topics_endpoint_503_on_malformed_topics_yaml(tmp_path, monkeypatch):
    from fastapi.testclient import TestClient
    import main
    pack = make_pack(tmp_path, monkeypatch, VALID)
    (pack / "topics.yaml").write_text("promoted: [unclosed", encoding="utf-8")
    resp = TestClient(main.app).get("/api/content/topics")
    assert resp.status_code == 503
    assert "Invalid YAML" in resp.json()["detail"]
