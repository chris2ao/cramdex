import sqlite3

import pytest


@pytest.fixture(autouse=True)
def _hermetic_env(tmp_path_factory, monkeypatch):
    """Isolate every test from the developer's real ~/.cramdex and env.

    Runs before every test in this directory (autouse). Tests that set their
    own CRAMDEX_HOME (e.g. via make_pack()) still win: they call
    monkeypatch.setenv() later, in the test body, which overrides the value
    set here.
    """
    monkeypatch.setenv("CRAMDEX_HOME",
                       str(tmp_path_factory.mktemp("cramdex-home")))
    for var in ("CRAMDEX_LLM_MODEL", "CRAMDEX_LLM_BASE_URL",
                "CRAMDEX_LLM_API_KEY", "ANTHROPIC_API_KEY", "OPENAI_API_KEY",
                "CRAMDEX_BOOKS_DIR", "CRAMDEX_PDF_PASSWORD"):
        monkeypatch.delenv(var, raising=False)


@pytest.fixture()
def fixture_db(tmp_path):
    """Miniature corpus DB with the real schema and three pages."""
    db = tmp_path / "corpus.db"
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
            ("book1", "Book 1", "Demo Course - Book 1.pdf", 160, 2),
            ("book2", "Book 2", "Demo Course - Book 2.pdf", 150, 2),
        ],
    )
    con.executemany(
        "INSERT INTO pages VALUES (?,?,?,?,?)",
        [
            ("book1", "Book 1", 72, 70,
             "DEMO-CYCLE lifecycle preparation identification containment"),
            ("book1", "Book 1", 92, 90,
             "the grid maps assets in scope to status and priority"),
            ("book2", "Book 2", 78, 76,
             "ops tempo cadence of briefings and shift patterns"),
        ],
    )
    con.commit()
    con.close()
    return db
