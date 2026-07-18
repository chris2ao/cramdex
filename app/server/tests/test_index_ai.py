import asyncio

from fastapi.testclient import TestClient

import config
import index_ai
import main
from llm.base import LLMError
from tests.test_pack_config import VALID, make_pack


class _FakeProvider:
    name = "fake"
    display_name = "Fake"

    def __init__(self, reply="", error=None):
        self._reply = reply
        self._error = error
        self.calls = []

    async def complete(self, system, user):
        self.calls.append((system, user))
        if self._error:
            raise self._error
        return self._reply


def test_parse_reply_filters_malformed_out_of_range_and_duplicates():
    reply = (
        "Demo Cycle\tSix-phase lifecycle\t3\n"
        "demo cycle\tduplicate\t4\n"
        "Out of Range\tpage outside span\t99\n"
        "not tab separated line\n"
        "No Page\tmissing page\tabc\n"
        "Dust Lock\tContainment posture\t5\n"
    )
    items = index_ai._parse_reply(reply, 3, 6)
    assert items == [
        {"term": "Demo Cycle", "definition": "Six-phase lifecycle", "printed_page": 3},
        {"term": "Dust Lock", "definition": "Containment posture", "printed_page": 5},
    ]


def test_parse_reply_caps_at_max_terms():
    reply = "\n".join(f"Term {i}\tdef\t3" for i in range(index_ai.MAX_TERMS + 10))
    assert len(index_ai._parse_reply(reply, 1, 8)) == index_ai.MAX_TERMS


def test_suggest_terms_builds_excerpts_and_parses(fixture_db):
    provider = _FakeProvider(reply="ops tempo\tBriefing cadence\t76\n")
    items = asyncio.run(index_ai.suggest_terms(
        "book2", 70, 77, db_path=fixture_db, provider=provider))
    assert items == [
        {"term": "ops tempo", "definition": "Briefing cadence", "printed_page": 76}]
    system, user = provider.calls[0]
    assert "[p.76]" in user
    assert "ops tempo" in user


def test_suggest_terms_empty_range_skips_the_provider(fixture_db):
    provider = _FakeProvider()
    items = asyncio.run(index_ai.suggest_terms(
        "book2", 200, 205, db_path=fixture_db, provider=provider))
    assert items == []
    assert provider.calls == []


def _pack_with_db(tmp_path, monkeypatch, fixture_db):
    make_pack(tmp_path, monkeypatch, VALID)
    monkeypatch.setattr(config, "db_path", lambda: fixture_db)


# NOTE: Deviation from the Task 3 brief's literal endpoint-test text. The
# VALID pack fixture (tests/test_pack_config.py) defines books book1
# ("Book 1") and workbook ("Workbook"), not book2 ("Book 2"). Endpoint tests
# go through config.manifest() (backed by VALID) as well as fixture_db, so
# they use "book1" with a page span covering fixture_db's book1 rows (printed
# pages 70 and 90) instead of the brief's "book2". The suggest_terms unit
# tests above bypass the manifest entirely (they pass db_path directly), so
# they keep book2/page 76 exactly as written in the brief.
def test_endpoint_happy_path(tmp_path, monkeypatch, fixture_db):
    _pack_with_db(tmp_path, monkeypatch, fixture_db)
    provider = _FakeProvider(reply="Demo Cycle\tSix-phase lifecycle\t70\n")
    monkeypatch.setattr(index_ai, "get_provider", lambda: provider)
    resp = TestClient(main.app).post(
        "/api/index/ai-suggest",
        json={"book": "book1", "first_page": 70, "last_page": 77})
    assert resp.status_code == 200
    assert resp.json()["items"] == [{
        "term": "Demo Cycle", "definition": "Six-phase lifecycle",
        "printed_page": 70, "slug": "book1", "label": "Book 1"}]


def test_endpoint_validation(tmp_path, monkeypatch, fixture_db):
    _pack_with_db(tmp_path, monkeypatch, fixture_db)
    client = TestClient(main.app)
    assert client.post("/api/index/ai-suggest", json={
        "book": "ghost", "first_page": 1, "last_page": 2}).status_code == 422
    assert client.post("/api/index/ai-suggest", json={
        "book": "book1", "first_page": 0, "last_page": 2}).status_code == 422
    assert client.post("/api/index/ai-suggest", json={
        "book": "book1", "first_page": 5, "last_page": 2}).status_code == 422
    assert client.post("/api/index/ai-suggest", json={
        "book": "book1", "first_page": 1,
        "last_page": 1 + index_ai.MAX_SPAN}).status_code == 422


def test_endpoint_maps_llm_error_to_502(tmp_path, monkeypatch, fixture_db):
    _pack_with_db(tmp_path, monkeypatch, fixture_db)
    provider = _FakeProvider(error=LLMError("provider exploded"))
    monkeypatch.setattr(index_ai, "get_provider", lambda: provider)
    resp = TestClient(main.app).post(
        "/api/index/ai-suggest",
        json={"book": "book1", "first_page": 70, "last_page": 77})
    assert resp.status_code == 502
    assert "provider exploded" in resp.json()["detail"]


def test_endpoint_503_when_corpus_missing(tmp_path, monkeypatch):
    make_pack(tmp_path, monkeypatch, VALID)
    resp = TestClient(main.app).post(
        "/api/index/ai-suggest",
        json={"book": "book1", "first_page": 1, "last_page": 2})
    assert resp.status_code == 503
