"""Paths, course-pack resolution, and environment for the cramdex server."""
from __future__ import annotations

import os
from dataclasses import dataclass
from datetime import date
from pathlib import Path

import yaml

REPO_ROOT = Path(__file__).resolve().parents[2]

DISALLOWED_TOOLS = "Bash,Edit,Write,NotebookEdit,WebFetch,WebSearch,Task"


class PackError(RuntimeError):
    """The active course pack is missing or malformed."""


LLM_PROVIDERS = ("claude_cli", "anthropic_api", "openai_compatible")
DEFAULT_ANTHROPIC_MODEL = "claude-opus-4-8"


@dataclass(frozen=True)
class LlmConfig:
    provider: str
    model: str | None
    base_url: str | None
    api_key: str | None

    @property
    def has_api_key(self) -> bool:
        return bool(self.api_key)


@dataclass(frozen=True)
class Book:
    slug: str
    label: str
    filename: str


@dataclass(frozen=True)
class Manifest:
    name: str
    exam_date: str | None
    books_dir: Path
    books: tuple[Book, ...]
    # True unless course.yaml explicitly sets `encrypted: false`. Real
    # courseware PDFs are normally encrypted, so this defaults to the
    # existing (password-required) behavior for every pack that predates
    # this field, including the user's real one.
    encrypted: bool = True

    @property
    def slugs(self) -> list[str]:
        return [b.slug for b in self.books]

    @property
    def labels(self) -> list[str]:
        return [b.label for b in self.books]


def cramdex_home() -> Path:
    return Path(os.environ.get("CRAMDEX_HOME", str(Path.home() / ".cramdex")))


def _home_config() -> dict:
    cfg = cramdex_home() / "config.yaml"
    if not cfg.is_file():
        return {}
    try:
        data = yaml.safe_load(cfg.read_text(encoding="utf-8")) or {}
    except (OSError, UnicodeDecodeError, yaml.YAMLError) as exc:
        raise PackError(f"Cannot read {cfg}: {exc}") from exc
    return data if isinstance(data, dict) else {}


def llm_config() -> LlmConfig:
    raw = _home_config().get("llm")
    raw = raw if isinstance(raw, dict) else {}
    provider = str(raw.get("provider") or "claude_cli")
    if provider not in LLM_PROVIDERS:
        raise PackError(
            f"Unknown LLM provider '{provider}'. Choose one of: "
            f"{', '.join(LLM_PROVIDERS)}.")
    model = os.environ.get("CRAMDEX_LLM_MODEL") or (
        str(raw["model"]) if raw.get("model") else None)
    base_url = os.environ.get("CRAMDEX_LLM_BASE_URL") or (
        str(raw["base_url"]) if raw.get("base_url") else None)
    api_key = None
    if provider == "anthropic_api":
        api_key = os.environ.get("ANTHROPIC_API_KEY")
    elif provider == "openai_compatible":
        api_key = (os.environ.get("CRAMDEX_LLM_API_KEY")
                   or os.environ.get("OPENAI_API_KEY"))
    return LlmConfig(provider=provider, model=model,
                     base_url=base_url, api_key=api_key)


def courses_dir() -> Path:
    return cramdex_home() / "courses"


def active_course_slug() -> str | None:
    data = _home_config()
    slug = data.get("active_course")
    return str(slug) if slug else None


def is_simple_slug(slug: str) -> bool:
    """True when slug is safe to join into courses_dir() as a single path
    component. Purely lexical (string-level): it never touches the
    filesystem or resolves the joined path, unlike content.safe_path,
    which resolves an already-built path and checks containment against
    the pack root after the fact. Rejects empty, ".", "..", and anything
    containing a path separator (Path(slug).name != slug for a multi-
    component string). Guards against a path-traversal-shaped slug (e.g.
    "../etc") reaching courses_dir() at all: slug is HTTP-reachable input
    via POST /api/course/activate, unlike active_course read back out of
    the user's own config.yaml.
    """
    return (bool(slug) and os.sep not in slug and slug != ".."
            and slug == Path(slug).name)


def course_not_found_message(slug: str) -> str:
    """Shared PackError/HTTPException detail for an unresolvable course
    slug (missing pack or rejected by is_simple_slug), used by both
    set_active_course and main.py's activate endpoint so the two layers
    never drift apart on wording."""
    return f"Course pack not found: {courses_dir() / slug} (slug: {slug})"


def list_courses() -> list[dict]:
    """Every course pack under courses_dir(): {"slug", "name", "active",
    "valid"}. Never raises: a pack whose course.yaml is missing/malformed
    (load_manifest raises PackError) yields name None, valid False rather
    than propagating. Missing courses dir yields []. Sorted by slug.

    "active" uses the same PackError-safe guard has_pack() uses: a
    malformed home config.yaml means nothing is marked active, it does not
    raise here either.
    """
    d = courses_dir()
    if not d.is_dir():
        return []
    try:
        active = active_course_slug()
    except PackError:
        active = None
    items: list[dict] = []
    for entry in sorted(d.iterdir(), key=lambda p: p.name):
        if not entry.is_dir() or not (entry / "course.yaml").is_file():
            continue
        try:
            name = load_manifest(entry).name
            valid = True
        except PackError:
            name = None
            valid = False
        items.append({
            "slug": entry.name,
            "name": name,
            "active": entry.name == active,
            "valid": valid,
        })
    return items


def set_active_course(slug: str) -> None:
    """Point cramdex_home()/config.yaml's active_course at slug, preserving
    every other existing key. Raises PackError (course_not_found_message)
    when slug fails the lexical is_simple_slug check or when
    courses_dir()/slug/course.yaml does not exist; nothing is written in
    either case.

    Rewrites config.yaml via the same yaml.safe_load/safe_dump round-trip
    make_demo_pack.build_demo_pack uses: any comments in that file are
    dropped, but every other key survives. Non-dict existing content (e.g.
    a YAML list) is replaced with a fresh mapping, matching _home_config's
    own coercion.
    """
    if (not is_simple_slug(slug)
            or not (courses_dir() / slug / "course.yaml").is_file()):
        raise PackError(course_not_found_message(slug))
    data = {**_home_config(), "active_course": slug}
    cfg = cramdex_home() / "config.yaml"
    cfg.write_text(yaml.safe_dump(data, sort_keys=False), encoding="utf-8")


def has_pack() -> bool:
    try:
        slug = active_course_slug()
    except PackError:
        return False
    return bool(slug) and (courses_dir() / str(slug) / "course.yaml").is_file()


def pack_dir() -> Path:
    slug = active_course_slug()
    if not slug:
        raise PackError(
            "No active course configured. Set active_course in "
            f"{cramdex_home() / 'config.yaml'} or run the setup wizard.")
    d = courses_dir() / slug
    if not (d / "course.yaml").is_file():
        raise PackError(f"Course pack not found: {d} (active_course: {slug})")
    return d


def load_manifest(pack: Path) -> Manifest:
    path = pack / "course.yaml"
    try:
        data = yaml.safe_load(path.read_text(encoding="utf-8"))
    except (OSError, UnicodeDecodeError) as exc:
        raise PackError(f"Cannot read {path}: {exc}") from exc
    except yaml.YAMLError as exc:
        raise PackError(f"Invalid YAML in {path}: {exc}") from exc
    if not isinstance(data, dict):
        raise PackError(f"{path} must be a YAML mapping")
    name = data.get("name")
    if not name or not isinstance(name, str):
        raise PackError(f"{path}: 'name' is required")
    books_dir_raw = data.get("books_dir")
    if not books_dir_raw:
        raise PackError(f"{path}: 'books_dir' is required")
    if not isinstance(books_dir_raw, str):
        raise PackError(f"{path}: 'books_dir' must be a string")
    raw_books = data.get("books")
    if not isinstance(raw_books, list) or not raw_books:
        raise PackError(f"{path}: 'books' must be a non-empty list")
    books: list[Book] = []
    seen: set[str] = set()
    for i, b in enumerate(raw_books):
        if not isinstance(b, dict):
            raise PackError(f"{path}: books[{i}] must be a mapping")
        missing = [k for k in ("slug", "label", "filename") if not b.get(k)]
        if missing:
            raise PackError(f"{path}: books[{i}] missing {', '.join(missing)}")
        slug = str(b["slug"])
        if slug in seen:
            raise PackError(f"{path}: duplicate book slug '{slug}'")
        seen.add(slug)
        books.append(Book(slug=slug, label=str(b["label"]),
                          filename=str(b["filename"])))
    exam_date_raw = data.get("exam_date")
    if exam_date_raw is not None and not isinstance(exam_date_raw, (str, date)):
        raise PackError(f"{path}: 'exam_date' must be a date or string")
    encrypted_raw = data.get("encrypted", True)
    if not isinstance(encrypted_raw, bool):
        raise PackError(f"{path}: 'encrypted' must be true or false")
    return Manifest(
        name=name,
        exam_date=str(exam_date_raw) if exam_date_raw else None,
        books_dir=Path(os.path.expanduser(books_dir_raw)),
        books=tuple(books),
        encrypted=encrypted_raw,
    )


def manifest() -> Manifest:
    return load_manifest(pack_dir())


def corpus_dir() -> Path:
    return pack_dir() / ".corpus"


def db_path() -> Path:
    return corpus_dir() / "corpus.db"


def pages_cache_dir() -> Path:
    return corpus_dir() / "pages"


def acronyms_path() -> Path:
    return corpus_dir() / "acronyms.tsv"


def titles_path() -> Path:
    return corpus_dir() / "titles.tsv"


def books_dir() -> Path:
    env = os.environ.get("CRAMDEX_BOOKS_DIR")
    if env:
        return Path(env)
    return manifest().books_dir


def pdf_password() -> str | None:
    env = os.environ.get("CRAMDEX_PDF_PASSWORD")
    if env:
        return env
    try:
        pw_file = corpus_dir() / ".pdf_password"
    except PackError:
        return None
    if pw_file.is_file():
        try:
            lines = pw_file.read_text(encoding="utf-8").splitlines()
        except (OSError, UnicodeDecodeError):
            return None
        if lines and lines[0].strip():
            return lines[0].strip()
    return None
