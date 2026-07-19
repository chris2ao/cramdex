# Cramdex

[![CI](https://github.com/chris2ao/cramdex/actions/workflows/ci.yml/badge.svg)](https://github.com/chris2ao/cramdex/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/chris2ao/cramdex)](https://github.com/chris2ao/cramdex/releases)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

A local, single-user study app built for studying SANS courses and
preparing the classic printed index for open-book GIAC certification
exams: book reader, ranked full-text search, flashcard quiz with
per-topic mastery, AI-grounded Q&A, bookmarks, an exam readiness
dashboard, and a personal exam index builder.

Point it at the SANS book PDFs you own and it builds a private, searchable
study environment on your machine. Cramdex never ships, stores, or uploads
course content, and none is in this repository; you bring your own books.
Other courseware that arrives as page-per-slide PDFs may work too, but
SANS course books are the design target.

See [app/README.md](app/README.md) for architecture and development
details, [CHANGELOG.md](CHANGELOG.md) for release history, and
[CONTRIBUTING.md](CONTRIBUTING.md) if you would like to help.

Cramdex is an independent community project, not affiliated with or
endorsed by SANS Institute or GIAC (see [Independence](#independence)).

## Try it in two minutes

No course of your own handy? `setup.sh --demo` builds a complete, fictional
course pack, MOON-101 Lunar Base Incident Response, so every feature (book
reader, search, quiz, glossary, frameworks, labs, and the readiness
dashboard) is populated with something to look at. Nothing in it is real
courseware.

```bash
git clone https://github.com/chris2ao/cramdex cramdex
cd cramdex

bash setup.sh --demo
bash app/run.sh
```

`setup.sh` checks for `uv`, Python 3.12, Node 18+, npm, and poppler
(`pdftotext`); creates or updates the backend virtualenv
(`app/server/.venv`); builds the demo course pack; extracts, calibrates, and
indexes it; and builds the frontend. `app/run.sh` then serves the app and
opens `http://127.0.0.1:8553` in your browser automatically; open it by hand
if it does not.

The Ask panel and AI-generated quiz questions additionally need an LLM
provider configured; the interactive setup below covers that, or see
app/README.md's [LLM providers](app/README.md#llm-providers) section
directly. The default `claude_cli` provider needs Claude Code installed and
on `PATH`.

## Use your own SANS books

```bash
git clone https://github.com/chris2ao/cramdex cramdex
cd cramdex

bash setup.sh
bash app/run.sh
```

Run without `--demo`, `setup.sh` hands off to an interactive wizard that
walks through:

1. **Dependency checks**: `uv`, Python 3.12, Node 18+, npm, and poppler
   (`pdftotext`), each with an actionable per-OS install hint on failure,
   then creates or updates the backend virtualenv.
2. **Course name**, then a proposed slug (derived from the name) you can
   accept or edit.
3. **Books folder**: the folder holding your downloaded SANS book PDFs
   (or other course PDFs you own). The scan is one level deep
   (subdirectories are not descended into); you're re-prompted until it
   finds at least one PDF.
4. **Book plan confirmation**: an editable list of the scanned books, in
   scan order. Rename a label, reorder, exclude a book, or undo the last
   exclude, then accept the plan.
5. **Automatic encryption detection**: every book in the accepted plan is
   probed with `pdftotext`; the whole pack must be uniformly encrypted or
   unencrypted (a mixed pack is rejected with the offending filenames). If
   the pack is encrypted, you're prompted for a hidden password (input is
   not echoed to the terminal), validated against the first book before
   anything is written. The password is then stored at the pack's
   `.corpus/.pdf_password` with `600` permissions; set `CRAMDEX_PDF_PASSWORD`
   in the environment instead if you'd rather not store it on disk.
6. **LLM provider choice**: `claude_cli` (default when `claude` is found on
   `PATH`, no API key needed), `anthropic_api` (needs `ANTHROPIC_API_KEY`),
   or `openai_compatible` (needs a base URL; works with Ollama, LM Studio,
   vLLM, or OpenAI itself). API keys are only ever read from environment
   variables, never collected or written to `config.yaml`. You can skip
   this step and configure it later.
7. **Corpus build** (extract, calibrate, index) and, if the frontend isn't
   already built, the **frontend build**.

When it finishes, launch with `bash app/run.sh`.

Re-run `bash setup.sh` any time to add another course; each run writes a new
pack under `~/.cramdex/courses/<slug>/` without touching your existing ones.
Once two or more valid packs exist, a course switcher appears in the app's
sidebar so you can flip the active course without restarting the server.

### Manual setup (no wizard)

Prefer to run each step by hand? This builds and serves the demo pack the
same way `setup.sh --demo` does:

```bash
git clone https://github.com/chris2ao/cramdex cramdex
cd cramdex

# Create the backend venv (make_demo_pack.py and build.sh both need it).
cd app/server
uv venv --python 3.12 .venv
uv pip install -r requirements.txt --python .venv/bin/python
cd ../..

# Build the fictional demo course pack.
app/server/.venv/bin/python scripts/make_demo_pack.py

# Extract, calibrate, and index the demo PDFs.
bash scripts/build.sh

# Build the frontend (first run only) and serve the app.
bash app/run.sh
```

To use your own books without the wizard, hand-author
`~/.cramdex/courses/<slug>/course.yaml` per app/README.md's
[Pack layout](app/README.md#pack-layout) section, set `active_course: <slug>`
in `~/.cramdex/config.yaml`, then run `bash scripts/build.sh` followed by
`bash app/run.sh`.

## Features

Alongside the book reader, ranked search, flashcard quiz, and AI-grounded Q&A
described above:

### Exam index builder

Build the personal, alphabetized index that GIAC open-book exams reward,
in the app instead of a spreadsheet. Capture entries
from three places, each via a `[+INDEX]` button that pre-fills the citation:
the search results view, the book reader, and the page image viewer. The
capture dialog then asks for the term, your own definition, and an optional
topic before saving.

The `/index` page ("Exam Index") suggests terms pulled from the corpus's
extracted book titles and acronyms, plus optional AI-assisted suggestions
generated from a chosen page range (this needs a configured LLM provider; see
[LLM providers](app/README.md#llm-providers)). Every suggestion is reviewed in
the same capture dialog before it is saved, nothing is added automatically.

The manage view groups entries alphabetically (with a `#` bucket for terms
that do not start with a letter), shows a color dot per source book, flags
duplicate terms, and supports inline editing and per-citation removal. A
dedicated print view (`/index/print`) lays the index out for printing, or
exporting to PDF, as your physical exam copy.

Entries export to CSV or JSON, and a JSON file can be re-imported. Import is
additive and conservative: incoming entries whose term already exists in your
index are skipped rather than merged, and the page reports how many entries
were added and skipped. To change an existing entry, edit it in the manage
view (or capture the extra citation with `[+INDEX]`, which does merge into
the matching term). A course pack may also
ship an `index-seed.json` file at its root; when present (the demo pack ships
one), the Index page offers a one-click import of it. The interchange format
used by export, import, and pack seeds is exactly:
`{"version": 1, "entries": [{"term": str, "definition": str, "citations": [{"slug": str, "label": str, "page": int}], "topic": str}]}`,
with optional `id` (string) and `at` (number) on each entry. For example:

```json
{
  "version": 1,
  "entries": [
    {
      "term": "Regolith Sweep",
      "definition": "Pre-EVA debris check on the airlock threshold.",
      "citations": [{ "slug": "book1", "label": "Book 1", "page": 42 }],
      "topic": "Dust Lock"
    }
  ]
}
```

All index entries live in the browser's localStorage (`cramdex.examIndex`),
same as the rest of cramdex's study state (see
[Study data and persistence](app/README.md#study-data-and-persistence)).
Clearing site data or switching browsers loses them, so export a JSON backup
periodically.

For architecture, the pack layout, the API, and development commands, see
[app/README.md](app/README.md).

## Independence

Cramdex is an independent open source study tool built by and for
students. It is not affiliated with, endorsed by, or sponsored by the
SANS Institute, GIAC, or any other training provider or certification
body. SANS and GIAC are trademarks of their respective owners, named here
only to describe what cramdex is designed to work with. Course materials
belong to their owners; cramdex never includes, distributes, or requires
any of them, and your own materials never leave your machine.
