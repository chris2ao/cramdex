"""Tests for the /api/index/suggest endpoint and its TSV parsing."""
from fastapi.testclient import TestClient

import content
import main
from tests.test_pack_config import VALID, make_pack

TITLES_TSV = (
    "book\tprinted_page\tpdf_page\ttitle\n"
    "Book 1\t3\t3\tDemo Cycle Overview\n"
    "Book 1\t6\t6\tRegolith Sweep\n"
    "Ghost Book\t9\t9\tShould Be Skipped\n"
    "Book 1\tnot-a-number\t4\tMalformed Row\n"
)
ACRONYMS_TSV = (
    "acronym\texpansion\tbook\tprinted_page\n"
    "LBIR\tLunar Base Incident Response\tBook 1\t1\n"
)


def test_parse_titles_skips_malformed_rows():
    rows = content.parse_titles(TITLES_TSV)
    assert [r["title"] for r in rows] == [
        "Demo Cycle Overview", "Regolith Sweep", "Should Be Skipped"]
    assert rows[0] == {
        "book": "Book 1", "printed_page": 3, "pdf_page": 3,
        "title": "Demo Cycle Overview"}


def _write_corpus(pack, titles=None, acronyms=None):
    corpus = pack / ".corpus"
    corpus.mkdir(exist_ok=True)
    if titles is not None:
        (corpus / "titles.tsv").write_text(titles, encoding="utf-8")
    if acronyms is not None:
        (corpus / "acronyms.tsv").write_text(acronyms, encoding="utf-8")


def test_suggest_merges_titles_and_acronyms_resolving_slugs(tmp_path, monkeypatch):
    pack = make_pack(tmp_path, monkeypatch, VALID)
    _write_corpus(pack, titles=TITLES_TSV, acronyms=ACRONYMS_TSV)
    items = TestClient(main.app).get("/api/index/suggest").json()["items"]
    kinds = {(i["term"], i["kind"]) for i in items}
    assert ("Demo Cycle Overview", "title") in kinds
    assert ("LBIR", "acronym") in kinds
    # rows whose book label is not in the manifest are dropped
    assert all(i["term"] != "Should Be Skipped" for i in items)
    acr = next(i for i in items if i["kind"] == "acronym")
    assert acr["hint"] == "Lunar Base Incident Response"
    assert acr["slug"] == "book1"


def test_suggest_book_filter(tmp_path, monkeypatch):
    pack = make_pack(tmp_path, monkeypatch, VALID)
    _write_corpus(pack, titles=TITLES_TSV, acronyms=ACRONYMS_TSV)
    # VALID's second book is slug "workbook" (label "Workbook"), not
    # "book2"/"Book 2"; all fixture rows above are for "Book 1", so
    # filtering by the workbook slug still yields no items.
    items = TestClient(main.app).get(
        "/api/index/suggest?book=workbook").json()["items"]
    assert items == []


def test_suggest_404_when_no_term_data(tmp_path, monkeypatch):
    make_pack(tmp_path, monkeypatch, VALID)
    resp = TestClient(main.app).get("/api/index/suggest")
    assert resp.status_code == 404
    assert "scripts/build.sh" in resp.json()["detail"]


def test_suggest_serves_one_tsv_when_the_other_is_absent(tmp_path, monkeypatch):
    pack = make_pack(tmp_path, monkeypatch, VALID)
    _write_corpus(pack, titles=TITLES_TSV)
    resp = TestClient(main.app).get("/api/index/suggest")
    assert resp.status_code == 200
    items = resp.json()["items"]
    assert any(i["term"] == "Demo Cycle Overview" and i["kind"] == "title"
               for i in items)
    assert all(i["kind"] != "acronym" for i in items)

    # Reset with a fresh pack covering the opposite case: acronyms.tsv
    # present, titles.tsv absent.
    pack = make_pack(tmp_path, monkeypatch, VALID, slug="demo2")
    _write_corpus(pack, acronyms=ACRONYMS_TSV)
    resp = TestClient(main.app).get("/api/index/suggest")
    assert resp.status_code == 200
    items = resp.json()["items"]
    assert any(i["term"] == "LBIR" and i["kind"] == "acronym" for i in items)
    assert all(i["kind"] != "title" for i in items)


def test_suggest_book_filter_positive_match(tmp_path, monkeypatch):
    pack = make_pack(tmp_path, monkeypatch, VALID)
    _write_corpus(pack, titles=TITLES_TSV, acronyms=ACRONYMS_TSV)
    items = TestClient(main.app).get(
        "/api/index/suggest?book=book1").json()["items"]
    assert items != []
    assert all(i["slug"] == "book1" for i in items)
