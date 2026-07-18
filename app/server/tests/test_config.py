from fastapi.testclient import TestClient

import config
import main
from tests.test_pack_config import VALID, make_pack


def test_pdf_password_returns_none_on_undecodable_file(tmp_path, monkeypatch):
    monkeypatch.delenv("CRAMDEX_PDF_PASSWORD", raising=False)
    pack = make_pack(tmp_path, monkeypatch, VALID)
    corpus = pack / ".corpus"
    corpus.mkdir()
    (corpus / ".pdf_password").write_bytes(b"\xff\xfe\x00")
    assert config.pdf_password() is None


def test_health_stays_200_when_pdf_password_file_is_undecodable(tmp_path, monkeypatch):
    monkeypatch.delenv("CRAMDEX_PDF_PASSWORD", raising=False)
    pack = make_pack(tmp_path, monkeypatch, VALID)
    corpus = pack / ".corpus"
    corpus.mkdir()
    (corpus / ".pdf_password").write_bytes(b"\xff\xfe\x00")
    client = TestClient(main.app)
    resp = client.get("/api/health")
    assert resp.status_code == 200
    assert resp.json()["checks"]["pdf_password"] is False
