from fastapi.testclient import TestClient

import main
from tests.test_pack_config import make_pack, VALID


class _FakeProvider:
    name = "anthropic_api"
    display_name = "Anthropic API"

    def status(self):
        return {"name": self.name, "display_name": self.display_name,
                "configured": True, "detail": "key present"}


def test_llm_endpoint_reports_status(tmp_path, monkeypatch):
    make_pack(tmp_path, monkeypatch, VALID)
    monkeypatch.setattr(main, "get_provider", lambda: _FakeProvider())
    body = TestClient(main.app).get("/api/llm").json()
    assert body["name"] == "anthropic_api"
    assert body["configured"] is True


def test_llm_endpoint_reports_default_claude_cli_status(tmp_path, monkeypatch):
    make_pack(tmp_path, monkeypatch, VALID)
    body = TestClient(main.app).get("/api/llm").json()
    assert body["name"] == "claude_cli"
    assert set(body.keys()) == {"name", "display_name", "configured", "detail"}
