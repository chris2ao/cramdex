"""Readers for the repo's study content (markdown, TSV, CSV, assets)."""
from __future__ import annotations

import csv
import re
from pathlib import Path

import yaml

import config


def strip_bold(cell: str) -> str:
    return re.sub(r"\*\*(.+?)\*\*", r"\1", cell).strip()


def _table_rows(md: str, header_first: str, ncols: int = 3):
    """Data rows of a markdown table: stripped cell lists, header and
    separator rows skipped (bold markers on the first cell tolerated)."""
    for line in md.splitlines():
        s = line.strip()
        if not s.startswith("|"):
            continue
        cells = [c.strip() for c in s.strip("|").split("|")]
        if len(cells) != ncols:
            continue
        first = strip_bold(cells[0])
        if first == header_first or set(first) <= {"-"}:
            continue
        yield cells


def parse_glossary(md: str) -> list[dict]:
    return [{
        "term": strip_bold(cells[0]),
        "definition": cells[1],
        "see": cells[2],
    } for cells in _table_rows(md, "Term")]


def book_label_pattern(labels: list[str]) -> str:
    """Alternation matching any configured book label, longest first so a
    label that prefixes another cannot shadow it. Each label is followed by
    a negative word-boundary lookahead so a longer, similarly-prefixed label
    (e.g. "Book 12") cannot partially match a shorter one (e.g. "Book 1")."""
    ordered = sorted(labels, key=len, reverse=True)
    return "|".join(re.escape(l) + r"(?!\w)" for l in ordered)


def citation_re(labels: list[str]) -> re.Pattern:
    return re.compile(rf"({book_label_pattern(labels)})\s+p\.(\d+)")


def parse_acronyms_md(md: str, labels: list[str]) -> list[dict]:
    """Curated acronym table: | Acronym | Expansion | <book label> p.X |."""
    rows = []
    citation = citation_re(labels)
    for cells in _table_rows(md, "Acronym"):
        m = citation.search(cells[2])
        if not m:
            continue
        rows.append({
            "acronym": strip_bold(cells[0]),
            "expansion": cells[1],
            "book": re.sub(r"\s+", " ", m.group(1)),
            "printed_page": int(m.group(2)),
        })
    return rows


def parse_acronyms(tsv: str) -> list[dict]:
    lines = [l for l in tsv.splitlines() if l.strip()]
    rows = []
    for line in lines[1:]:
        parts = line.split("\t")
        if len(parts) != 4:
            continue
        try:
            page = int(parts[3])
        except ValueError:
            continue
        rows.append({
            "acronym": parts[0], "expansion": parts[1],
            "book": parts[2], "printed_page": page,
        })
    return rows


def parse_titles(tsv: str) -> list[dict]:
    """Parses .corpus/titles.tsv (book, printed_page, pdf_page, title)."""
    lines = [l for l in tsv.splitlines() if l.strip()]
    rows = []
    for line in lines[1:]:
        parts = line.split("\t")
        if len(parts) != 4:
            continue
        try:
            printed = int(parts[1])
            pdf = int(parts[2])
        except ValueError:
            continue
        rows.append({
            "book": parts[0], "printed_page": printed,
            "pdf_page": pdf, "title": parts[3],
        })
    return rows


def parse_frameworks(md: str) -> list[dict]:
    sections: list[dict] = []
    current: dict | None = None
    for line in md.splitlines():
        if line.startswith("## "):
            current = {"title": line[3:].strip(), "body": ""}
            sections.append(current)
        elif _HR_RE.match(line.strip()):
            current = None  # a horizontal rule ends the section (file footer)
        elif current is not None:
            current["body"] += line + "\n"
    return [{"title": s["title"], "body": s["body"].strip()} for s in sections]


def parse_slide_index(md: str) -> list[dict]:
    rows = []
    for line in md.splitlines():
        if not line.strip().startswith("|"):
            continue
        cells = [c.strip() for c in line.strip().strip("|").split("|")]
        if len(cells) != 3 or not cells[2].isdigit():
            continue
        rows.append({"title": cells[0], "book": cells[1], "page": int(cells[2])})
    return rows


_HR_RE = re.compile(r"^[-*_]{3,}$")
_DESC_LIMIT = 120


def _strip_emphasis(text: str) -> str:
    text = re.sub(r"\*\*(.+?)\*\*", r"\1", text)
    text = re.sub(r"(?<!\*)\*([^*]+?)\*(?!\*)", r"\1", text)
    text = re.sub(r"`([^`]+?)`", r"\1", text)
    return text.strip()


def _truncate_on_word_boundary(text: str, limit: int = _DESC_LIMIT) -> str:
    if len(text) <= limit:
        return text
    cut = text[:limit].rsplit(" ", 1)[0].rstrip(" ,.;:")
    return (cut or text[:limit]) + "…"


def _paragraphs(lines: list[str]) -> list[str]:
    """Blank-line-separated blocks, each joined into one string.

    Body prose and metadata preambles are hard-wrapped across several
    physical lines in these files, so classifying line-by-line misses
    continuation lines (e.g. "19 January** (about to brief...)" is a
    wrapped continuation of a "**Scenario:**" metadata line, not body
    text on its own). Joining by paragraph keeps each block intact.
    """
    paras = []
    current: list[str] = []
    for line in lines:
        if line.strip():
            current.append(line.strip())
        else:
            if current:
                paras.append(" ".join(current))
                current = []
    if current:
        paras.append(" ".join(current))
    return paras


def _lab_desc(lines: list[str]) -> str:
    """First non-heading, non-metadata, non-quote body paragraph, cleaned up."""
    for para in _paragraphs(lines):
        if para.startswith(("#", "**", ">")):
            continue
        if _HR_RE.match(para):
            continue
        return _truncate_on_word_boundary(_strip_emphasis(para))
    return ""


def _lab_title_and_desc(md_path: Path) -> tuple[str, str]:
    lines = md_path.read_text(encoding="utf-8").splitlines()
    title = md_path.stem
    for line in lines:
        if line.startswith("# "):
            title = line[2:].strip()
            break
    return title, _lab_desc(lines)


def _rel(p: Path) -> str:
    """Pack-relative path; absolute when outside the pack (test fixtures).

    Falls back to the raw path both when `p` is not under the active pack
    and when there is no active pack at all (e.g. `list_labs` called with an
    explicit root that has nothing to do with the configured pack).
    """
    try:
        return str(p.relative_to(config.pack_dir()))
    except (ValueError, config.PackError):
        return str(p)


def list_labs(pack_root: Path | None = None) -> list[dict]:
    base = (pack_root or config.pack_dir()) / "labs"
    groups = []
    if not base.is_dir():
        return groups
    for book_dir in sorted(p for p in base.iterdir() if p.is_dir()):
        labs = []
        for writeup in sorted(book_dir.glob("lab-*.md")):
            if writeup.stem.endswith("-comparison"):
                continue
            lab_id = writeup.stem
            comparison = book_dir / f"{lab_id}-comparison.md"
            title, desc = _lab_title_and_desc(writeup)
            labs.append({
                "id": lab_id,
                "title": title,
                "desc": desc,
                "writeup": _rel(writeup),
                "comparison": _rel(comparison) if comparison.is_file() else None,
                "csvs": [_rel(c) for c in sorted(book_dir.glob(f"{lab_id}-*.csv"))],
            })
        if labs:
            groups.append({"book": book_dir.name, "labs": labs})
    return groups


def safe_path(rel: str) -> Path:
    root = config.pack_dir().resolve()
    candidate = (root / rel).resolve()
    if not (candidate.is_relative_to(root) and candidate.is_file()):
        raise ValueError(f"Path not allowed: {rel}")
    relative = candidate.relative_to(root)
    if any(part.startswith(".") for part in relative.parts):
        raise ValueError(f"Path not allowed: {rel}")
    return candidate


def read_csv_table(path: Path) -> dict:
    with path.open(encoding="utf-8") as fh:
        reader = csv.reader(fh)
        rows = [r for r in reader if any(cell.strip() for cell in r)]
    if not rows:
        return {"headers": [], "rows": []}
    return {"headers": rows[0], "rows": rows[1:]}


_ASSET_KINDS = {".png": "image", ".jpg": "image", ".pdf": "pdf", ".html": "html"}


def list_assets() -> list[dict]:
    assets_dir = config.pack_dir() / "assets"
    items = []
    if not assets_dir.is_dir():
        return items
    for p in sorted(assets_dir.iterdir()):
        kind = _ASSET_KINDS.get(p.suffix.lower())
        if kind:
            items.append({"name": p.name, "kind": kind,
                          "path": str(p.relative_to(config.pack_dir()))})
    return items


def load_topics(pack: Path, m) -> dict:
    """Quiz topic taxonomy: topics.yaml when present, else one theme per
    book. Theme keys arrive keyed by book slug and are served keyed by book
    label, because quiz cards carry labels."""
    promoted: list[dict] = []
    themes: dict[str, str] = {}
    fallback = "General"
    path = pack / "topics.yaml"
    if path.is_file():
        try:
            data = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
        except OSError as exc:
            raise config.PackError(f"Cannot read {path}: {exc}") from exc
        except yaml.YAMLError as exc:
            raise config.PackError(f"Invalid YAML in {path}: {exc}") from exc
        if isinstance(data, dict):
            for item in data.get("promoted") or []:
                if isinstance(item, dict) and item.get("key") and item.get("label"):
                    promoted.append({"key": str(item["key"]).upper(),
                                     "label": str(item["label"])})
            slug_to_label = {b.slug: b.label for b in m.books}
            raw_themes = data.get("themes") or {}
            if not isinstance(raw_themes, dict):
                raise config.PackError(f"{path}: 'themes' must be a mapping")
            for slug, theme in raw_themes.items():
                label = slug_to_label.get(str(slug))
                if label and theme:
                    themes[label] = str(theme)
            if data.get("fallback"):
                fallback = str(data["fallback"])
    for b in m.books:
        themes.setdefault(b.label, b.label)
    order: list[str] = []
    for p in promoted:
        if p["label"] not in order:
            order.append(p["label"])
    for theme in (themes[b.label] for b in m.books):
        if theme not in order:
            order.append(theme)
    if fallback not in order:
        order.append(fallback)
    return {"promoted": promoted, "themes": themes,
            "fallback": fallback, "order": order}
