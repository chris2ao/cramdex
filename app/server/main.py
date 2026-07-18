"""FastAPI entry point for the cramdex study app."""
from __future__ import annotations

import json
import mimetypes
import os
import shutil
import sqlite3
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse, JSONResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from starlette.exceptions import HTTPException as StarletteHTTPException

import ask as ask_mod
import config
import content as content_mod
import index_ai
import pages as pages_mod
import quiz as quiz_mod
import search as search_mod
from llm import LLMError, get_provider

app = FastAPI(title="Cramdex")
_DIST = config.REPO_ROOT / "app" / "web" / "dist"


class AskBody(BaseModel):
    question: str


class CourseActivateBody(BaseModel):
    slug: str


def _read_or_404(path, hint: str) -> str:
    if not path.is_file():
        raise HTTPException(404, f"Missing {path.name}. {hint}")
    return path.read_text(encoding="utf-8")


def _read_optional(path) -> str | None:
    return path.read_text(encoding="utf-8") if path.is_file() else None


@app.exception_handler(config.PackError)
async def pack_error(request, exc: config.PackError):
    return JSONResponse({"detail": str(exc)}, status_code=503)


@app.get("/api/course")
def api_course() -> dict:
    m = config.manifest()
    return {"name": m.name, "exam_date": m.exam_date,
            "books": [{"slug": b.slug, "label": b.label} for b in m.books]}


@app.get("/api/courses")
def api_courses() -> dict:
    return {"items": config.list_courses()}


@app.post("/api/course/activate")
def api_course_activate(body: CourseActivateBody) -> dict:
    # Reject a malformed slug (e.g. a path-traversal shape) before ever
    # touching the filesystem, then pre-check the pack exists: both 404
    # with the same shared message, distinct from a genuinely broken home
    # config.yaml, which set_active_course still surfaces as a PackError ->
    # the global pack_error handler -> 503 below.
    if not config.is_simple_slug(body.slug):
        raise HTTPException(404, config.course_not_found_message(body.slug))
    if not (config.courses_dir() / body.slug / "course.yaml").is_file():
        raise HTTPException(404, config.course_not_found_message(body.slug))
    config.set_active_course(body.slug)
    return {"items": config.list_courses()}


@app.get("/api/content/notes")
def api_notes() -> dict:
    notes_dir = config.pack_dir() / "notes"
    items = []
    if notes_dir.is_dir():
        for p in sorted(notes_dir.glob("*.md")):
            title = p.stem
            for line in p.read_text(encoding="utf-8").splitlines():
                if line.startswith("# "):
                    title = line[2:].strip()
                    break
            items.append({"title": title, "path": f"notes/{p.name}"})
    return {"items": items}


@app.get("/api/content/topics")
def api_topics() -> dict:
    return content_mod.load_topics(config.pack_dir(), config.manifest())


@app.get("/api/health")
def health() -> dict:
    pack = config.has_pack()
    try:
        llm_ok = get_provider().status()["configured"]
    except (config.PackError, LLMError):
        llm_ok = False
    # config.manifest() is evaluated at most once here: course.yaml can be
    # malformed even when has_pack() is True (that check only looks for the
    # file, not valid content), and both the books_dir and pdf_password
    # checks need a parsed manifest. On PackError, both checks degrade to
    # False (course_pack itself stays True; the pack file exists, it's
    # just broken) so the setup banner still points at the problem instead
    # of 500ing the whole endpoint. books_dir_ok is derived from the
    # already-loaded manifest rather than calling config.books_dir()
    # (which would parse course.yaml a second time when CRAMDEX_BOOKS_DIR
    # is unset); the CRAMDEX_BOOKS_DIR override is applied inline instead,
    # matching what config.books_dir() itself does.
    books_dir_ok = pdf_password_ok = False
    if pack:
        try:
            m = config.manifest()
            env_books = os.environ.get("CRAMDEX_BOOKS_DIR")
            books_dir_ok = (Path(env_books) if env_books else m.books_dir).is_dir()
            # Unencrypted packs (course.yaml: encrypted: false) never need
            # a password; encrypted packs (the default) still require one.
            pdf_password_ok = (not m.encrypted) or config.pdf_password() is not None
        except config.PackError:
            pass
    checks = {
        "course_pack": pack,
        "corpus_db": pack and config.db_path().is_file(),
        "poppler": shutil.which("pdftoppm") is not None,
        "llm": llm_ok,
        "books_dir": books_dir_ok,
        "pdf_password": pdf_password_ok,
    }
    return {"ok": all(checks.values()), "checks": checks}


@app.get("/api/llm")
def api_llm() -> dict:
    return get_provider().status()


@app.get("/api/search")
def api_search(q: str, book: str | None = None, mode: str = "phrase",
               limit: int = 20) -> dict:
    if not config.db_path().is_file():
        raise HTTPException(503, "Corpus index not found. Run scripts/build.sh.")
    try:
        results = search_mod.search_pages(q, book, mode, max(1, min(limit, 50)))
    except sqlite3.OperationalError as exc:
        raise HTTPException(400, f"Bad query: {exc}") from exc
    return {"query": q, "mode": mode, "results": results}


@app.get("/api/content/books")
def api_books() -> dict:
    if not config.db_path().is_file():
        raise HTTPException(503, "Corpus index not found. Run scripts/build.sh.")
    return {"items": search_mod.list_books()}


@app.post("/api/ask")
def api_ask(body: AskBody) -> StreamingResponse:
    if not config.db_path().is_file():
        raise HTTPException(503, "Corpus index not found. Run scripts/build.sh.")
    return StreamingResponse(ask_mod.stream_answer(body.question),
                             media_type="text/event-stream")


@app.get("/api/page/{slug}/{printed_page}.png")
def api_page(slug: str, printed_page: int) -> FileResponse:
    try:
        path = pages_mod.render_page(slug, printed_page)
    except pages_mod.PageError as exc:
        raise HTTPException(exc.status, exc.detail) from exc
    return FileResponse(path, media_type="image/png")


@app.get("/api/content/glossary")
def api_glossary() -> dict:
    md = _read_or_404(config.pack_dir() / "glossary.md",
                      "Add glossary.md to your course pack.")
    return {"items": content_mod.parse_glossary(md)}


def _load_acronyms(labels: list[str]) -> list[dict] | None:
    """Curated markdown list when it yields entries, else the extractor's raw
    TSV. A curated file that parses to nothing falls through to the TSV so a
    bad edit degrades to scraped data instead of an empty deck."""
    md = _read_optional(config.pack_dir() / "acronyms.md")
    if md is not None:
        items = content_mod.parse_acronyms_md(md, labels)
        if items:
            return items
    tsv = _read_optional(config.acronyms_path())
    return content_mod.parse_acronyms(tsv) if tsv is not None else None


@app.get("/api/content/acronyms")
def api_acronyms() -> dict:
    m = config.manifest()
    items = _load_acronyms(m.labels)
    if items is None:
        raise HTTPException(
            404, "No acronym list found. Add acronyms.md or acronyms.tsv "
                 "to your course pack.")
    return {"items": items}


@app.get("/api/index/suggest")
def api_index_suggest(book: str | None = None) -> dict:
    """Candidate index terms from the extraction TSVs, slugs resolved."""
    m = config.manifest()
    label_to_slug = {b.label: b.slug for b in m.books}
    titles = _read_optional(config.titles_path())
    acronyms = _read_optional(config.acronyms_path())
    if titles is None and acronyms is None:
        raise HTTPException(
            404, "No extracted term data found. Run scripts/build.sh to "
                 "build the corpus and extract index terms.")
    items: list[dict] = []
    for row in content_mod.parse_titles(titles) if titles is not None else []:
        slug = label_to_slug.get(row["book"])
        if slug is None:
            continue
        items.append({"term": row["title"], "slug": slug, "label": row["book"],
                      "printed_page": row["printed_page"], "kind": "title",
                      "hint": ""})
    for row in content_mod.parse_acronyms(acronyms) if acronyms is not None else []:
        slug = label_to_slug.get(row["book"])
        if slug is None:
            continue
        items.append({"term": row["acronym"], "slug": slug, "label": row["book"],
                      "printed_page": row["printed_page"], "kind": "acronym",
                      "hint": row["expansion"]})
    if book:
        items = [i for i in items if i["slug"] == book]
    return {"items": items}


class IndexAiBody(BaseModel):
    book: str
    first_page: int
    last_page: int


@app.post("/api/index/ai-suggest")
async def api_index_ai_suggest(body: IndexAiBody) -> dict:
    m = config.manifest()
    labels = {b.slug: b.label for b in m.books}
    if body.book not in labels:
        raise HTTPException(422, f"Unknown book: {body.book}")
    if body.first_page < 1 or body.last_page < body.first_page:
        raise HTTPException(
            422, "Invalid page range: first_page must be >= 1 and "
                 "<= last_page.")
    if body.last_page - body.first_page + 1 > index_ai.MAX_SPAN:
        raise HTTPException(
            422, f"Page range too large: at most {index_ai.MAX_SPAN} pages "
                 "per request.")
    try:
        items = await index_ai.suggest_terms(
            body.book, body.first_page, body.last_page)
    except LLMError as exc:
        raise HTTPException(502, str(exc)) from exc
    return {"items": [
        {**item, "slug": body.book, "label": labels[body.book]}
        for item in items]}


@app.get("/api/content/frameworks")
def api_frameworks() -> dict:
    md = _read_or_404(config.pack_dir() / "frameworks.md",
                      "Add frameworks.md to your course pack.")
    return {"items": content_mod.parse_frameworks(md)}


@app.get("/api/content/slide-index")
def api_slide_index() -> dict:
    md = _read_or_404(config.pack_dir() / "slide-index.md",
                      "Add slide-index.md to your course pack.")
    return {"items": content_mod.parse_slide_index(md)}


@app.get("/api/content/index-seed")
def api_index_seed() -> dict:
    """Optional pack-provided starter index (index-seed.json at pack root)."""
    path = config.pack_dir() / "index-seed.json"
    if not path.is_file():
        raise HTTPException(
            404, "Missing index-seed.json. A course pack may optionally "
                 "ship a starter index at its root.")
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise HTTPException(422, f"index-seed.json is invalid: {exc}") from exc
    if not isinstance(data, dict) or not isinstance(data.get("entries"), list):
        raise HTTPException(
            422, "index-seed.json must be an object with an 'entries' list.")
    return data


@app.get("/api/content/labs")
def api_labs() -> dict:
    return {"items": content_mod.list_labs()}


def _safe_or_400(path: str):
    try:
        return content_mod.safe_path(path)
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc


@app.get("/api/content/doc")
def api_doc(path: str) -> dict:
    p = _safe_or_400(path)
    try:
        markdown = p.read_text(encoding="utf-8")
    except UnicodeDecodeError:
        raise HTTPException(400, f"Not a text file: {p.name}")
    return {"path": path, "markdown": markdown}


@app.get("/api/content/csv")
def api_csv(path: str) -> dict:
    p = _safe_or_400(path)
    try:
        return content_mod.read_csv_table(p)
    except UnicodeDecodeError:
        raise HTTPException(400, f"Not a text file: {p.name}")


@app.get("/api/content/assets")
def api_assets() -> dict:
    return {"items": content_mod.list_assets()}


@app.get("/api/content/file")
def api_file(path: str) -> FileResponse:
    p = _safe_or_400(path)
    media, _ = mimetypes.guess_type(p.name)
    return FileResponse(p, media_type=media or "application/octet-stream")


@app.get("/api/quiz/deck")
def api_quiz_deck(source: str = "all") -> dict:
    m = config.manifest()
    glossary_md = _read_optional(config.pack_dir() / "glossary.md")
    frameworks_md = _read_optional(config.pack_dir() / "frameworks.md")
    acronyms = _load_acronyms(m.labels)
    if glossary_md is None and frameworks_md is None and not acronyms:
        raise HTTPException(
            404, "No quiz sources found. Add glossary.md, frameworks.md, "
                 "or acronyms.md/.tsv to your course pack.")
    glossary = (content_mod.parse_glossary(glossary_md)
                if glossary_md is not None else [])
    frameworks = (content_mod.parse_frameworks(frameworks_md)
                  if frameworks_md is not None else [])
    return {"items": quiz_mod.build_deck(glossary, frameworks,
                                         acronyms or [], source, labels=m.labels)}


class GenerateBody(BaseModel):
    topic: str = ""
    count: int = 5


@app.post("/api/quiz/generate")
async def api_quiz_generate(body: GenerateBody) -> dict:
    m = config.manifest()
    try:
        items = await quiz_mod.generate(body.topic, min(body.count, 10),
                                        m.name, m.labels[0])
        return {"items": items}
    except (ValueError, LLMError) as exc:
        # 502 Bad Gateway: the upstream LLM call failed or returned output
        # this endpoint couldn't parse. 503 Service Unavailable is reserved
        # for local problems (missing course pack, unreadable corpus) via
        # the config.PackError handler registered above.
        raise HTTPException(502, str(exc)) from exc


@app.exception_handler(StarletteHTTPException)
async def spa_fallback(request, exc):
    accepts_html = "text/html" in request.headers.get("accept", "")
    if (exc.status_code == 404 and accepts_html
            and not request.url.path.startswith("/api")
            and (_DIST / "index.html").is_file()):
        return FileResponse(_DIST / "index.html")
    return JSONResponse({"detail": exc.detail}, status_code=exc.status_code,
                        headers=getattr(exc, "headers", None))


if _DIST.is_dir():
    app.mount("/", StaticFiles(directory=_DIST, html=True), name="spa")
