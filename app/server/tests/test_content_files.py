import pytest
from fastapi.testclient import TestClient

import content
import main
from tests.test_pack_config import VALID, make_pack

SLIDE_MD = """# Demo Course Slide Index (auto-generated)
| Term / Slide title | Book | Page |
|---|---|---|
| Ops Tempo | Book 2 | 74 |
| Meteor Drill Scenario | Book 3 | 82 |
"""


def test_parse_slide_index():
    rows = content.parse_slide_index(SLIDE_MD)
    assert rows == [
        {"title": "Ops Tempo", "book": "Book 2", "page": 74},
        {"title": "Meteor Drill Scenario", "book": "Book 3", "page": 82},
    ]


def test_list_labs_groups_and_classifies(tmp_path):
    book_dir = tmp_path / "labs" / "book3"
    book_dir.mkdir(parents=True)
    (book_dir / "lab-3.4.md").write_text("# Lab 3.4 - Reviewing a Notification\nbody")
    (book_dir / "lab-3.4-comparison.md").write_text("# comparison")
    (book_dir / "lab-3.4-actions.csv").write_text("A,B\n1,2\n")
    groups = content.list_labs(tmp_path)
    assert groups[0]["book"] == "book3"
    lab = groups[0]["labs"][0]
    assert lab["id"] == "lab-3.4"
    assert lab["title"] == "Lab 3.4 - Reviewing a Notification"
    assert lab["writeup"].endswith("lab-3.4.md")
    assert lab["comparison"].endswith("lab-3.4-comparison.md")
    assert lab["csvs"] == [lab["csvs"][0]]


def test_list_labs_desc_skips_metadata_headings_and_quotes(tmp_path):
    book_dir = tmp_path / "labs" / "book1"
    book_dir.mkdir(parents=True)
    (book_dir / "lab-1.1.md").write_text(
        "# Lab 1.1 - Sample\n"
        "\n"
        "**Course:** Demo Course · **Section:** 1, wrapped onto a\n"
        "second physical line that is still part of the same metadata block.\n"
        "\n"
        "> A note about the workbook solution.\n"
        "\n"
        "---\n"
        "\n"
        "## Heading before the real content\n"
        "\n"
        "The real one-line summary starts here and should become the desc.\n"
    )
    groups = content.list_labs(tmp_path)
    lab = groups[0]["labs"][0]
    assert lab["desc"] == (
        "The real one-line summary starts here and should become the desc."
    )


def test_list_labs_desc_empty_when_only_headings(tmp_path):
    book_dir = tmp_path / "labs" / "book1"
    book_dir.mkdir(parents=True)
    (book_dir / "lab-1.1.md").write_text(
        "# Lab 1.1 - Sample\n"
        "\n"
        "## Section A\n"
        "\n"
        "### Section B\n"
    )
    groups = content.list_labs(tmp_path)
    lab = groups[0]["labs"][0]
    assert lab["desc"] == ""


def test_list_labs_desc_truncates_on_word_boundary(tmp_path):
    book_dir = tmp_path / "labs" / "book1"
    book_dir.mkdir(parents=True)
    long_word = "supercalifragilisticexpialidocious"  # 34 chars, no truncation mid-word
    long_para = " ".join([long_word] * 6)  # 209 chars, well over the 120 limit
    (book_dir / "lab-1.1.md").write_text(f"# Lab 1.1 - Sample\n\n{long_para}\n")
    groups = content.list_labs(tmp_path)
    lab = groups[0]["labs"][0]
    assert lab["desc"] == f"{long_word} {long_word} {long_word}…"
    assert len(lab["desc"]) <= 121
    for word in lab["desc"].rstrip("…").split():
        assert word == long_word  # every word is whole, none cut mid-token


def test_list_labs_desc_strips_emphasis_markers(tmp_path):
    book_dir = tmp_path / "labs" / "book1"
    book_dir.mkdir(parents=True)
    (book_dir / "lab-1.1.md").write_text(
        "# Lab 1.1 - Sample\n"
        "\n"
        "This has **bold**, *italic*, and `code` markers to strip.\n"
    )
    groups = content.list_labs(tmp_path)
    lab = groups[0]["labs"][0]
    assert lab["desc"] == "This has bold, italic, and code markers to strip."


def test_api_doc_400_on_non_utf8_file(tmp_path, monkeypatch):
    bad = tmp_path / "binary.md"
    bad.write_bytes(b"\xff\xfe\x00")
    monkeypatch.setattr(content, "safe_path", lambda p: bad)
    client = TestClient(main.app)
    resp = client.get("/api/content/doc", params={"path": "whatever"})
    assert resp.status_code == 400
    assert "binary.md" in resp.json()["detail"]


def test_api_csv_400_on_non_utf8_file(tmp_path, monkeypatch):
    bad = tmp_path / "binary.csv"
    bad.write_bytes(b"\xff\xfe\x00")
    monkeypatch.setattr(content, "safe_path", lambda p: bad)
    client = TestClient(main.app)
    resp = client.get("/api/content/csv", params={"path": "whatever"})
    assert resp.status_code == 400
    assert "binary.csv" in resp.json()["detail"]


# --- content.safe_path: pack-scoped path-traversal coverage ---------------
# (Re-covers ground lost when test_safe_path_allows_docs_rejects_escape was
# deleted at seed time; these fixtures are a fictional Demo Course pack.)

def test_safe_path_resolves_valid_pack_relative_file(tmp_path, monkeypatch):
    pack = make_pack(tmp_path, monkeypatch, VALID)
    (pack / "glossary.md").write_text("# Glossary\n", encoding="utf-8")
    resolved = content.safe_path("glossary.md")
    assert resolved == (pack / "glossary.md").resolve()


def test_safe_path_rejects_relative_traversal(tmp_path, monkeypatch):
    make_pack(tmp_path, monkeypatch, VALID)
    with pytest.raises(ValueError):
        content.safe_path("../../../etc/passwd")


def test_safe_path_rejects_absolute_path(tmp_path, monkeypatch):
    make_pack(tmp_path, monkeypatch, VALID)
    with pytest.raises(ValueError):
        content.safe_path("/etc/passwd")


def test_safe_path_rejects_escape_via_dotdot_segments_to_real_file(tmp_path, monkeypatch):
    pack = make_pack(tmp_path, monkeypatch, VALID)
    outside = pack.parent / "outside.txt"
    outside.write_text("nope", encoding="utf-8")
    with pytest.raises(ValueError):
        content.safe_path("../outside.txt")


def test_safe_path_rejects_dotfiles_inside_corpus_dir(tmp_path, monkeypatch):
    pack = make_pack(tmp_path, monkeypatch, VALID)
    corpus = pack / ".corpus"
    corpus.mkdir()
    (corpus / ".pdf_password").write_text("secretpw", encoding="utf-8")
    (corpus / "corpus.db").write_text("fake db", encoding="utf-8")
    with pytest.raises(ValueError):
        content.safe_path(".corpus/.pdf_password")
    with pytest.raises(ValueError):
        content.safe_path(".corpus/corpus.db")


def test_api_file_400_on_corpus_dotfile_escape(tmp_path, monkeypatch):
    pack = make_pack(tmp_path, monkeypatch, VALID)
    corpus = pack / ".corpus"
    corpus.mkdir()
    (corpus / ".pdf_password").write_text("secretpw", encoding="utf-8")
    client = TestClient(main.app)
    resp = client.get("/api/content/file", params={"path": ".corpus/.pdf_password"})
    assert resp.status_code == 400


def test_api_doc_rejects_traversal_escape(tmp_path, monkeypatch):
    make_pack(tmp_path, monkeypatch, VALID)
    client = TestClient(main.app)
    resp = client.get("/api/content/doc",
                      params={"path": "../../../etc/passwd"})
    assert resp.status_code == 400


def test_api_doc_serves_valid_pack_file(tmp_path, monkeypatch):
    pack = make_pack(tmp_path, monkeypatch, VALID)
    (pack / "glossary.md").write_text("# Demo Glossary\n", encoding="utf-8")
    client = TestClient(main.app)
    resp = client.get("/api/content/doc", params={"path": "glossary.md"})
    assert resp.status_code == 200
    assert resp.json()["markdown"] == "# Demo Glossary\n"


# --- /api/content/glossary: pack-scoped coverage ---------------------------

def test_api_glossary_returns_items_from_pack(tmp_path, monkeypatch):
    pack = make_pack(tmp_path, monkeypatch, VALID)
    (pack / "glossary.md").write_text(
        "| Term | What | See |\n|---|---|---|\n"
        "| **DEMO-CYCLE** | Lifecycle. | Book 1 p.70 |\n", encoding="utf-8")
    client = TestClient(main.app)
    resp = client.get("/api/content/glossary")
    assert resp.status_code == 200
    assert resp.json()["items"] == [
        {"term": "DEMO-CYCLE", "definition": "Lifecycle.", "see": "Book 1 p.70"},
    ]


def test_api_glossary_404_when_pack_missing_glossary_file(tmp_path, monkeypatch):
    make_pack(tmp_path, monkeypatch, VALID)
    client = TestClient(main.app)
    resp = client.get("/api/content/glossary")
    assert resp.status_code == 404
    assert "glossary.md" in resp.json()["detail"]


def test_api_glossary_503_when_no_active_pack(tmp_path, monkeypatch):
    monkeypatch.setenv("CRAMDEX_HOME", str(tmp_path / "nothing"))
    client = TestClient(main.app)
    resp = client.get("/api/content/glossary")
    assert resp.status_code == 503
