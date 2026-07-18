"""Course-pack resolution and manifest validation."""
import textwrap
from pathlib import Path

import pytest
import yaml

import config

MALFORMED = "name: X\nbooks: [unclosed\n"


def make_pack(tmp_path, monkeypatch, course_yaml, slug="demo", active=True):
    home = tmp_path / "cramdex-home"
    pack = home / "courses" / slug
    pack.mkdir(parents=True)
    (pack / "course.yaml").write_text(textwrap.dedent(course_yaml), encoding="utf-8")
    if active:
        (home / "config.yaml").write_text(f"active_course: {slug}\n", encoding="utf-8")
    monkeypatch.setenv("CRAMDEX_HOME", str(home))
    return pack


VALID = """
    name: Demo Course
    exam_date: 2027-01-01
    books_dir: /tmp/demo-books
    books:
      - slug: book1
        label: Book 1
        filename: Demo Course - Book 1.pdf
      - slug: workbook
        label: Workbook
        filename: Demo Course - Workbook.pdf
"""


def test_valid_manifest(tmp_path, monkeypatch):
    pack = make_pack(tmp_path, monkeypatch, VALID)
    m = config.manifest()
    assert m.name == "Demo Course"
    assert m.exam_date == "2027-01-01"
    assert m.slugs == ["book1", "workbook"]
    assert m.labels == ["Book 1", "Workbook"]
    assert config.pack_dir() == pack
    assert config.db_path() == pack / ".corpus" / "corpus.db"
    assert config.pages_cache_dir() == pack / ".corpus" / "pages"


def test_no_home_config(tmp_path, monkeypatch):
    monkeypatch.setenv("CRAMDEX_HOME", str(tmp_path / "empty"))
    assert config.active_course_slug() is None
    assert config.has_pack() is False
    with pytest.raises(config.PackError):
        config.pack_dir()


def test_active_course_pack_missing(tmp_path, monkeypatch):
    home = tmp_path / "home"
    home.mkdir()
    (home / "config.yaml").write_text("active_course: ghost\n", encoding="utf-8")
    monkeypatch.setenv("CRAMDEX_HOME", str(home))
    assert config.has_pack() is False
    with pytest.raises(config.PackError, match="ghost"):
        config.pack_dir()


@pytest.mark.parametrize("yaml_body,msg", [
    ("books: []\nbooks_dir: /x\n", "name"),
    ("name: X\nbooks_dir: /x\nbooks: []\n", "books"),
    ("name: X\nbooks_dir: /x\nbooks:\n  - slug: a\n    label: A\n", "filename"),
    ("name: X\nbooks_dir: /x\nbooks:\n"
     "  - {slug: a, label: A, filename: a.pdf}\n"
     "  - {slug: a, label: B, filename: b.pdf}\n", "duplicate"),
    ("name: X\nbooks:\n  - {slug: a, label: A, filename: a.pdf}\n", "books_dir"),
    ("name: X\nbooks_dir: [1, 2, 3]\nbooks:\n"
     "  - {slug: a, label: A, filename: a.pdf}\n", "books_dir"),
    ("name: X\nbooks_dir: /x\nexam_date: [2027, 1, 1]\nbooks:\n"
     "  - {slug: a, label: A, filename: a.pdf}\n", "exam_date"),
])
def test_invalid_manifest(tmp_path, monkeypatch, yaml_body, msg):
    make_pack(tmp_path, monkeypatch, yaml_body)
    with pytest.raises(config.PackError, match=msg):
        config.manifest()


def test_manifest_encrypted_defaults_true(tmp_path, monkeypatch):
    """No `encrypted` key in course.yaml: preserves the existing
    password-required behavior for every pack that predates this field."""
    make_pack(tmp_path, monkeypatch, VALID)
    assert config.manifest().encrypted is True


def test_manifest_encrypted_false(tmp_path, monkeypatch):
    make_pack(tmp_path, monkeypatch,
              textwrap.dedent(VALID) + "encrypted: false\n")
    assert config.manifest().encrypted is False


def test_manifest_encrypted_non_bool_raises(tmp_path, monkeypatch):
    make_pack(tmp_path, monkeypatch,
              textwrap.dedent(VALID) + "encrypted: maybe\n")
    with pytest.raises(config.PackError, match="encrypted"):
        config.manifest()


def test_books_dir_env_override(tmp_path, monkeypatch):
    make_pack(tmp_path, monkeypatch, VALID)
    monkeypatch.setenv("CRAMDEX_BOOKS_DIR", "/somewhere/else")
    assert str(config.books_dir()) == "/somewhere/else"
    monkeypatch.delenv("CRAMDEX_BOOKS_DIR")
    assert str(config.books_dir()) == "/tmp/demo-books"


def test_pdf_password_env_then_file(tmp_path, monkeypatch):
    pack = make_pack(tmp_path, monkeypatch, VALID)
    assert config.pdf_password() is None
    corpus = pack / ".corpus"
    corpus.mkdir()
    (corpus / ".pdf_password").write_text("filepw\n", encoding="utf-8")
    assert config.pdf_password() == "filepw"
    monkeypatch.setenv("CRAMDEX_PDF_PASSWORD", "envpw")
    assert config.pdf_password() == "envpw"


def test_malformed_home_config_raises_clear_error(tmp_path, monkeypatch):
    home = tmp_path / "home"
    home.mkdir()
    (home / "config.yaml").write_text("active_course: [unclosed", encoding="utf-8")
    monkeypatch.setenv("CRAMDEX_HOME", str(home))
    with pytest.raises(config.PackError, match="Cannot read"):
        config.pack_dir()
    assert config.has_pack() is False


def test_malformed_course_yaml_raises_invalid_yaml(tmp_path, monkeypatch):
    make_pack(tmp_path, monkeypatch, "name: X\nbooks: [unclosed\n")
    with pytest.raises(config.PackError, match="Invalid YAML"):
        config.manifest()


def test_hermetic_fixture_ignores_real_home(monkeypatch, tmp_path):
    """The autouse `_hermetic_env` fixture (tests/conftest.py) sets
    CRAMDEX_HOME before this test body runs, so poisoning Path.home() here
    must have no effect: config must never fall back to it."""
    poison_home = tmp_path / "poisoned-real-home"
    poison_cramdex = poison_home / ".cramdex"
    poison_cramdex.mkdir(parents=True)
    (poison_cramdex / "config.yaml").write_text(
        "active_course: poison\n", encoding="utf-8")
    monkeypatch.setattr(Path, "home", lambda: poison_home)
    assert config.active_course_slug() is None
    assert config.has_pack() is False


# --- list_courses -----------------------------------------------------

def test_list_courses_no_courses_dir_returns_empty(tmp_path, monkeypatch):
    monkeypatch.setenv("CRAMDEX_HOME", str(tmp_path / "empty"))
    assert config.list_courses() == []


def test_list_courses_two_packs_one_malformed(tmp_path, monkeypatch):
    make_pack(tmp_path, monkeypatch, VALID, slug="alpha", active=True)
    make_pack(tmp_path, monkeypatch, MALFORMED, slug="beta", active=False)
    assert config.list_courses() == [
        {"slug": "alpha", "name": "Demo Course", "active": True, "valid": True},
        {"slug": "beta", "name": None, "active": False, "valid": False},
    ]


def test_list_courses_sorted_by_slug(tmp_path, monkeypatch):
    make_pack(tmp_path, monkeypatch, VALID, slug="zeta", active=True)
    make_pack(tmp_path, monkeypatch, VALID, slug="alpha", active=False)
    assert [c["slug"] for c in config.list_courses()] == ["alpha", "zeta"]


def test_list_courses_ignores_non_dir_and_dirs_without_manifest(tmp_path, monkeypatch):
    make_pack(tmp_path, monkeypatch, VALID, slug="alpha", active=True)
    home = config.cramdex_home()
    (home / "courses" / "stray.txt").write_text("not a course", encoding="utf-8")
    (home / "courses" / "empty_dir").mkdir()
    assert [c["slug"] for c in config.list_courses()] == ["alpha"]


def test_list_courses_malformed_home_config_active_false_everywhere(
        tmp_path, monkeypatch):
    make_pack(tmp_path, monkeypatch, VALID, slug="alpha", active=False)
    home = config.cramdex_home()
    (home / "config.yaml").write_text("active_course: [unclosed", encoding="utf-8")
    assert config.list_courses() == [
        {"slug": "alpha", "name": "Demo Course", "active": False, "valid": True},
    ]


# --- set_active_course --------------------------------------------------

def test_set_active_course_missing_pack_raises_packerror(tmp_path, monkeypatch):
    make_pack(tmp_path, monkeypatch, VALID, slug="alpha", active=True)
    with pytest.raises(config.PackError, match="ghost"):
        config.set_active_course("ghost")
    assert config.active_course_slug() == "alpha"  # untouched on failure


def test_set_active_course_switches_active(tmp_path, monkeypatch):
    make_pack(tmp_path, monkeypatch, VALID, slug="alpha", active=True)
    make_pack(tmp_path, monkeypatch, VALID, slug="beta", active=False)
    config.set_active_course("beta")
    assert config.active_course_slug() == "beta"


def test_set_active_course_preserves_other_keys_incl_llm_block(tmp_path, monkeypatch):
    make_pack(tmp_path, monkeypatch, VALID, slug="alpha", active=True)
    make_pack(tmp_path, monkeypatch, VALID, slug="beta", active=False)
    cfg = config.cramdex_home() / "config.yaml"
    cfg.write_text(
        "active_course: alpha\n"
        "llm:\n"
        "  provider: anthropic_api\n"
        "  model: claude-opus-4-8\n"
        "custom_key: keep-me\n",
        encoding="utf-8",
    )
    config.set_active_course("beta")
    data = yaml.safe_load(cfg.read_text(encoding="utf-8"))
    assert data["active_course"] == "beta"
    assert data["llm"] == {"provider": "anthropic_api", "model": "claude-opus-4-8"}
    assert data["custom_key"] == "keep-me"


def test_set_active_course_non_dict_existing_content_replaced(tmp_path, monkeypatch):
    make_pack(tmp_path, monkeypatch, VALID, slug="alpha", active=False)
    cfg = config.cramdex_home() / "config.yaml"
    cfg.write_text("- just\n- a\n- list\n", encoding="utf-8")
    config.set_active_course("alpha")
    assert yaml.safe_load(cfg.read_text(encoding="utf-8")) == {"active_course": "alpha"}


def test_set_active_course_broken_home_config_raises(tmp_path, monkeypatch):
    make_pack(tmp_path, monkeypatch, VALID, slug="alpha", active=False)
    cfg = config.cramdex_home() / "config.yaml"
    cfg.write_text("active_course: [unclosed", encoding="utf-8")
    with pytest.raises(config.PackError, match="Cannot read"):
        config.set_active_course("alpha")


@pytest.mark.parametrize("bad_slug", ["", ".", "..", "a/b", "../etc", "/etc"])
def test_set_active_course_rejects_non_simple_slug(tmp_path, monkeypatch, bad_slug):
    """slug is joined directly into courses_dir() and is reachable via
    POST /api/course/activate, so it must be a single path component: no
    empty string, no "." / "..", no embedded separators (path traversal)."""
    make_pack(tmp_path, monkeypatch, VALID, slug="alpha", active=True)
    with pytest.raises(config.PackError, match="not found"):
        config.set_active_course(bad_slug)
    assert config.active_course_slug() == "alpha"  # untouched on rejection


def test_set_active_course_rejects_traversal_slug_even_when_target_exists(
        tmp_path, monkeypatch):
    """Pins the slug-shape guard itself rather than the sandbox's
    emptiness: a real course.yaml exists at the filesystem location the
    traversal slug resolves to (courses_dir()/"../outside" ==
    cramdex_home()/"outside"), so an is_file()-only check would wrongly
    accept it. The guard must reject the shape before that check runs."""
    make_pack(tmp_path, monkeypatch, VALID, slug="alpha", active=True)
    outside = config.cramdex_home() / "outside"
    outside.mkdir()
    (outside / "course.yaml").write_text(VALID, encoding="utf-8")
    with pytest.raises(config.PackError, match="not found"):
        config.set_active_course("../outside")
    assert config.active_course_slug() == "alpha"  # untouched on rejection


# --- UnicodeDecodeError handling ----------------------------------------

def test_load_manifest_invalid_utf8_raises_packerror(tmp_path, monkeypatch):
    pack = make_pack(tmp_path, monkeypatch, VALID, slug="alpha", active=True)
    (pack / "course.yaml").write_bytes(b"name: X\n\xff\n")
    with pytest.raises(config.PackError, match="Cannot read"):
        config.manifest()


def test_list_courses_invalid_utf8_sibling_is_invalid_not_raising(
        tmp_path, monkeypatch):
    make_pack(tmp_path, monkeypatch, VALID, slug="alpha", active=True)
    bad_pack = config.cramdex_home() / "courses" / "beta"
    bad_pack.mkdir(parents=True)
    (bad_pack / "course.yaml").write_bytes(b"name: X\n\xff\n")
    items = {c["slug"]: c for c in config.list_courses()}
    assert items["beta"] == {
        "slug": "beta", "name": None, "active": False, "valid": False}
