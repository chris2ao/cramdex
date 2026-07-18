import pytest
from fastapi.testclient import TestClient

import main
import quiz
from llm import LLMError
from tests.test_pack_config import VALID, make_pack

GLOSSARY = [{"term": "DEMO-CYCLE", "definition": "Lifecycle.", "see": "Book 1 p.70"}]
FRAMEWORKS = [{"title": "PACES - layered planning", "body": "Primary.\nSee: **Book B p.9**."}]
ACRONYMS = [{"acronym": "AD", "expansion": "Active Directory", "book": "Book 1",
             "printed_page": 124}]
LABELS = ["Book 1", "Book 2", "Book B", "Workbook"]


def test_build_deck_all_sources():
    deck = quiz.build_deck(GLOSSARY, FRAMEWORKS, ACRONYMS, labels=LABELS)
    kinds = {c["kind"] for c in deck}
    assert kinds == {"term", "framework", "acronym"}
    term = next(c for c in deck if c["kind"] == "term")
    assert term == {"front": "DEMO-CYCLE", "back": "Lifecycle.",
                    "see": "Book 1 p.70", "kind": "term", "book": "Book 1"}
    acro = next(c for c in deck if c["kind"] == "acronym")
    assert acro["see"] == "Book 1 p.124"
    assert acro["book"] == "Book 1"


def test_build_deck_source_filter():
    deck = quiz.build_deck(GLOSSARY, FRAMEWORKS, ACRONYMS, source="term", labels=LABELS)
    assert all(c["kind"] == "term" for c in deck)


def test_build_deck_framework_citation_split():
    deck = quiz.build_deck([], FRAMEWORKS, [], source="framework", labels=LABELS)
    fw = deck[0]
    assert fw["back"] == "Primary."
    assert fw["see"] == "Book B p.9."
    assert fw["book"] == "Book B"


def test_first_book_labels():
    assert quiz.first_book("Book 1 p.70; Book 2 p.7", LABELS) == "Book 1"
    assert quiz.first_book("Workbook p.121", LABELS) == "Workbook"
    assert quiz.first_book("Book B p.9", LABELS) == "Book B"
    assert quiz.first_book("no citation", LABELS) == ""


def test_first_book_does_not_let_a_longer_number_shadow_a_shorter_label():
    """A label match must stop at a word boundary: "Book 1" is not a hit
    inside "Book 12", since that citation is for a different, unconfigured
    book."""
    labels = ["Book 1", "Workbook"]
    assert quiz.first_book("Book 12 p.5", labels) == ""
    assert quiz.first_book("Book 1 p.5", labels) == "Book 1"


def test_split_framework_body_keeps_prose_without_see_line():
    back, see = quiz.split_framework_body("Line one.\nLine two.")
    assert back == "Line one.\nLine two."
    assert see == ""


def test_split_framework_body_joins_wrapped_citation():
    body = ("Prose line.\n"
            "See: **Book 3 p.48** (definitions), **p.49-51** (developing\n"
            "GIRs and PIRs).")
    back, see = quiz.split_framework_body(body)
    assert back == "Prose line."
    assert see == "Book 3 p.48 (definitions), p.49-51 (developing GIRs and PIRs)."


def test_parse_generated_extracts_json_array():
    text = 'Here you go:\n```json\n[{"question":"Q?","answer":"A","see":"Book 1 p.7"}]\n```'
    items = quiz.parse_generated(text)
    assert items == [{"question": "Q?", "answer": "A", "see": "Book 1 p.7"}]


def test_parse_generated_raises_on_garbage():
    with pytest.raises(ValueError):
        quiz.parse_generated("no json here")


def test_parse_generated_ignores_bracketed_prose_around_array():
    text = ('Here are your questions [as requested]:\n'
            '[{"question":"Q?","answer":"A","see":"Book 1 p.7"}]\n'
            'Good luck [with the exam]!')
    items = quiz.parse_generated(text)
    assert items == [{"question": "Q?", "answer": "A", "see": "Book 1 p.7"}]


class _FakeProvider:
    """Records the (system, user) prompts it was called with and returns
    canned completion text, standing in for a real LLM provider."""

    name = "fake"
    display_name = "Fake"

    def __init__(self, text):
        self._text = text
        self.calls = []

    async def complete(self, system, user):
        self.calls.append((system, user))
        return self._text


@pytest.mark.asyncio
async def test_generate_parses_provider_completion_json():
    provider = _FakeProvider('[{"question":"Q","answer":"A","see":"S"}]')
    items = await quiz.generate("topic", 3, "Demo Course", "Book 1", provider=provider)
    assert items == [{"question": "Q", "answer": "A", "see": "S"}]


@pytest.mark.asyncio
async def test_generate_prompt_names_course_and_example_label():
    provider = _FakeProvider("[]")
    await quiz.generate("", 3, "Demo Course", "Workbook", provider=provider)
    system, user = provider.calls[0]
    assert "Demo Course" in system
    assert "Workbook p.X" in user


@pytest.mark.asyncio
async def test_generate_falls_back_to_whole_course_topic():
    provider = _FakeProvider("[]")
    await quiz.generate("", 3, "Demo Course", "Workbook", provider=provider)
    _, user = provider.calls[0]
    assert "the whole course" in user


def test_quiz_generate_endpoint_clamps_count_and_uses_first_label(tmp_path, monkeypatch):
    make_pack(tmp_path, monkeypatch, VALID)
    captured = {}

    async def fake_generate(topic, count, course_name, example_label, provider=None):
        captured["count"], captured["label"] = count, example_label
        return [{"question": "Q", "answer": "A", "see": "S"}]

    monkeypatch.setattr(quiz, "generate", fake_generate)
    client = TestClient(main.app)
    resp = client.post("/api/quiz/generate", json={"topic": "x", "count": 99})
    assert resp.status_code == 200
    assert captured["count"] == 10
    assert captured["label"] == "Book 1"
    assert resp.json()["items"][0]["question"] == "Q"


def test_quiz_generate_endpoint_maps_llm_error_to_502(tmp_path, monkeypatch):
    make_pack(tmp_path, monkeypatch, VALID)

    async def fake_generate(*args, **kwargs):
        raise LLMError("provider down")

    monkeypatch.setattr(quiz, "generate", fake_generate)
    client = TestClient(main.app)
    resp = client.post("/api/quiz/generate", json={"topic": "x", "count": 3})
    assert resp.status_code == 502
    assert "provider down" in resp.json()["detail"]


def test_quiz_generate_endpoint_maps_value_error_to_502(tmp_path, monkeypatch):
    make_pack(tmp_path, monkeypatch, VALID)

    async def fake_generate(*args, **kwargs):
        raise ValueError("no JSON array in output")

    monkeypatch.setattr(quiz, "generate", fake_generate)
    client = TestClient(main.app)
    resp = client.post("/api/quiz/generate", json={"topic": "x", "count": 3})
    assert resp.status_code == 502
    assert "no JSON array" in resp.json()["detail"]


def _write_course_files(pack, with_acronyms_md=False):
    (pack / "glossary.md").write_text(
        "| Term | What | See |\n|---|---|---|\n"
        "| **DEMO-CYCLE** | Lifecycle. | Book 1 p.70 |\n", encoding="utf-8")
    (pack / "frameworks.md").write_text(
        "## PACES - layered planning\nPrimary.\nSee: **Book B p.9**.\n",
        encoding="utf-8")
    if with_acronyms_md:
        (pack / "acronyms.md").write_text(
            "| Acronym | Expansion | See |\n|---|---|---|\n"
            "| **DMTK** | Demo Management Toolkit | Book 1 p.7 |\n",
            encoding="utf-8")


def test_quiz_deck_degrades_when_acronym_sources_missing(tmp_path, monkeypatch):
    pack = make_pack(tmp_path, monkeypatch, VALID)
    _write_course_files(pack)
    client = TestClient(main.app)
    resp = client.get("/api/quiz/deck")
    assert resp.status_code == 200
    kinds = {c["kind"] for c in resp.json()["items"]}
    assert "term" in kinds and "framework" in kinds and "acronym" not in kinds


def test_quiz_deck_prefers_curated_acronyms(tmp_path, monkeypatch):
    pack = make_pack(tmp_path, monkeypatch, VALID)
    _write_course_files(pack, with_acronyms_md=True)
    corpus = pack / ".corpus"
    corpus.mkdir()
    (corpus / "acronyms.tsv").write_text(
        "acronym\texpansion\tbook\tprinted_page\n"
        "AI\tChatGPT\tBook 1\t144\n", encoding="utf-8")
    client = TestClient(main.app)
    cards = client.get("/api/quiz/deck?source=acronym").json()["items"]
    assert [c["front"] for c in cards] == ["DMTK"]
    assert cards[0]["back"] == "Demo Management Toolkit"


def test_acronyms_endpoint_prefers_curated_file(tmp_path, monkeypatch):
    pack = make_pack(tmp_path, monkeypatch, VALID)
    _write_course_files(pack, with_acronyms_md=True)
    client = TestClient(main.app)
    items = client.get("/api/content/acronyms").json()["items"]
    assert items == [{"acronym": "DMTK",
                      "expansion": "Demo Management Toolkit",
                      "book": "Book 1", "printed_page": 7}]


def test_acronyms_fall_back_to_tsv_when_curated_parses_empty(tmp_path, monkeypatch):
    pack = make_pack(tmp_path, monkeypatch, VALID)
    _write_course_files(pack)
    (pack / "acronyms.md").write_text("# no table here\n", encoding="utf-8")
    corpus = pack / ".corpus"
    corpus.mkdir()
    (corpus / "acronyms.tsv").write_text(
        "acronym\texpansion\tbook\tprinted_page\n"
        "AD\tActive Directory\tBook 1\t124\n", encoding="utf-8")
    client = TestClient(main.app)
    items = client.get("/api/content/acronyms").json()["items"]
    assert [i["acronym"] for i in items] == ["AD"]


def test_quiz_deck_404_when_all_sources_missing(tmp_path, monkeypatch):
    make_pack(tmp_path, monkeypatch, VALID)
    client = TestClient(main.app)
    resp = client.get("/api/quiz/deck")
    assert resp.status_code == 404
    assert "course pack" in resp.json()["detail"].lower()
