import sqlite3

from fastapi.testclient import TestClient

import config
import main
import search
from tests.test_pack_config import VALID, make_pack


def test_build_match_phrase_and_or():
    assert search.build_match("ops tempo", "phrase") == '"ops tempo"'
    assert search.build_match("ops tempo", "or") == "ops OR tempo"
    assert search.build_match('x AND y', "raw") == "x AND y"


def test_search_pages_returns_citation_fields(fixture_db):
    hits = search.search_pages("ops tempo", None, "phrase", 10, db_path=fixture_db)
    assert len(hits) == 1
    hit = hits[0]
    assert hit["slug"] == "book2"
    assert hit["printed_page"] == 76
    assert "[[" in hit["snippet"]


def test_search_book_filter(fixture_db):
    hits = search.search_pages("the", "book1", "or", 10, db_path=fixture_db)
    assert all(h["slug"] == "book1" for h in hits)


def test_search_endpoint(fixture_db, monkeypatch):
    monkeypatch.setattr(config, "db_path", lambda: fixture_db)
    client = TestClient(main.app)
    body = client.get("/api/search", params={"q": "DEMO-CYCLE"}).json()
    assert body["results"][0]["label"] == "Book 1"


def test_search_endpoint_503_without_db(monkeypatch, tmp_path):
    monkeypatch.setattr(config, "db_path", lambda: tmp_path / "none.db")
    client = TestClient(main.app)
    assert client.get("/api/search", params={"q": "x"}).status_code == 503


def test_search_endpoint_clamps_negative_limit(fixture_db, monkeypatch):
    monkeypatch.setattr(config, "db_path", lambda: fixture_db)
    client = TestClient(main.app)
    body = client.get("/api/search", params={"q": "the", "mode": "or", "limit": -1}).json()
    assert 1 <= len(body["results"]) <= 50


def test_list_books_returns_slug_label_and_max_page(fixture_db):
    items = search.list_books(db_path=fixture_db, slug_order=["book1", "book2"])
    assert items == [
        {"slug": "book1", "label": "Book 1", "pages": 90},
        {"slug": "book2", "label": "Book 2", "pages": 76},
    ]


def test_list_books_orders_by_explicit_slug_order_regardless_of_insert_order(tmp_path):
    db = tmp_path / "reordered.db"
    con = sqlite3.connect(db)
    con.execute(
        "CREATE TABLE books (slug TEXT PRIMARY KEY, label TEXT,"
        " source_filename TEXT, pdf_pages INTEGER, offset INTEGER)"
    )
    con.execute(
        "CREATE VIRTUAL TABLE pages USING fts5(slug UNINDEXED, label UNINDEXED,"
        " pdf_page UNINDEXED, printed_page UNINDEXED, text,"
        " tokenize = 'porter unicode61')"
    )
    con.executemany(
        "INSERT INTO books VALUES (?,?,?,?,?)",
        [
            ("workbook", "Workbook", "wb.pdf", 240, 2),
            ("bookB", "Book B", "bB.pdf", 25, 2),
            ("book2", "Book 2", "b2.pdf", 150, 2),
            ("book1", "Book 1", "b1.pdf", 160, 2),
        ],
    )
    con.commit()
    con.close()
    items = search.list_books(db_path=db,
                              slug_order=["book1", "book2", "bookB", "workbook"])
    assert [i["slug"] for i in items] == ["book1", "book2", "bookB", "workbook"]


def test_list_books_defaults_to_zero_pages_when_book_has_no_pages_rows(tmp_path):
    db = tmp_path / "empty_pages.db"
    con = sqlite3.connect(db)
    con.execute(
        "CREATE TABLE books (slug TEXT PRIMARY KEY, label TEXT,"
        " source_filename TEXT, pdf_pages INTEGER, offset INTEGER)"
    )
    con.execute(
        "CREATE VIRTUAL TABLE pages USING fts5(slug UNINDEXED, label UNINDEXED,"
        " pdf_page UNINDEXED, printed_page UNINDEXED, text,"
        " tokenize = 'porter unicode61')"
    )
    con.execute("INSERT INTO books VALUES (?,?,?,?,?)",
                ("bookB", "Book B", "bB.pdf", 25, 2))
    con.commit()
    con.close()
    items = search.list_books(db_path=db, slug_order=["bookB"])
    assert items == [{"slug": "bookB", "label": "Book B", "pages": 0}]


def test_api_books_endpoint_returns_items(fixture_db, monkeypatch, tmp_path):
    make_pack(tmp_path, monkeypatch, VALID)
    monkeypatch.setattr(config, "db_path", lambda: fixture_db)
    client = TestClient(main.app)
    body = client.get("/api/content/books").json()
    assert body["items"] == [
        {"slug": "book1", "label": "Book 1", "pages": 90},
        {"slug": "book2", "label": "Book 2", "pages": 76},
    ]


def test_api_books_endpoint_503_without_db(monkeypatch, tmp_path):
    make_pack(tmp_path, monkeypatch, VALID)
    monkeypatch.setattr(config, "db_path", lambda: tmp_path / "none.db")
    client = TestClient(main.app)
    assert client.get("/api/content/books").status_code == 503
