# Cramdex developer guide

Cramdex is a local, single-user study app for courseware you own. It serves
an active course pack (books, glossary, frameworks, notes, labs) as a
searchable, readable, quizzable corpus with real study-progress tracking:
exam readiness, per-book reading position, per-topic quiz mastery with
weak-area drilling, bookmarks, and an exam countdown.

Everything runs on your machine. The corpus never leaves `127.0.0.1`, and no
courseware content is committed to the repo (see [Content policy](#content-policy)).

The visual language is a cyberpunk HUD: near-black background, neon cyan and
signal yellow accents, corner-bracket panels, chamfered buttons, monospace
system labels, and no border radius anywhere.

## Quick start

New to the repo? `./setup.sh` (from the repo root) is the front door: it
checks dependencies, builds/updates the backend venv, walks you through
course setup (or builds the fictional demo pack with `--demo`), builds the
corpus, and builds the frontend. See the root README's
["Try it in two minutes"](../README.md#try-it-in-two-minutes) and
["Use your own course books"](../README.md#use-your-own-course-books)
sections for the full walkthrough.

Once a course pack exists, launch (or re-launch) with:

```bash
./app/run.sh          # builds venv + frontend on first run, serves http://127.0.0.1:8553
```

Build tooling, if not already installed (`setup.sh` checks for all of these
with per-OS install hints; this is for a manual/dev setup):

```bash
brew install uv node poppler
```

`uv` manages the Python 3.12 backend venv, Node 18+ builds the React
frontend, and poppler (`pdftoppm`/`pdftotext`) renders book pages as images
and probes PDF encryption.

Windows: cramdex targets macOS and Linux, including Windows Subsystem for
Linux (WSL2). On Windows, install WSL2, open a WSL Ubuntu shell (not
PowerShell or Git Bash), and clone the repo inside the WSL filesystem (not
`/mnt/c/...`) before running `setup.sh` or any other command below.

Runtime prerequisites (the top-bar `CORPUS::ONLINE` indicator and the red
setup panel report exactly what is missing):

| Requirement | Why | Fix |
| --- | --- | --- |
| An active course pack (see Pack layout) | search, quiz, books, page counts | run `bash setup.sh` (interactive) or `bash setup.sh --demo`, hand-author the pack, or build the demo pack directly (see root README) |
| `pdftoppm` (poppler) | rendering book pages as images | `brew install poppler` |
| `claude` CLI | Ask answers and AI quiz generation (default `claude_cli` provider) | install Claude Code |
| Source PDFs, plus a PDF password if they are encrypted | page image rendering | `CRAMDEX_PDF_PASSWORD`, or the pack's `.corpus/.pdf_password` |

## Architecture

```
app/
├── run.sh          # launcher: venv + frontend build if needed, then uvicorn on :8553
├── server/         # FastAPI (Python 3.12, uv venv), stateless over the corpus DB
│   ├── main.py     # routes; serves the built frontend from web/dist with SPA fallback
│   ├── config.py   # course-pack resolution, manifest loading, env vars
│   ├── search.py   # FTS5 (BM25) queries + book list with real page counts
│   ├── content.py  # glossary/acronyms/frameworks/slide-index/labs/assets/notes parsers
│   ├── pages.py    # on-demand page PNG rendering (pdftoppm), cached in the pack's .corpus/pages/
│   ├── ask.py      # SSE streaming answers from the claude CLI (sandboxed)
│   └── quiz.py     # deck building + AI question generation
└── web/            # React 19 + Vite + Tailwind CSS v4 + react-router 7
    └── src/
        ├── pages/          # one file per route
        ├── components/     # shell + shared components; ui/ holds the design primitives
        ├── stores/         # typed localStorage stores (all study stats)
        ├── hooks/          # useFetch, useReadiness
        └── lib/            # course/topics data fetching, citation parsing, SSE client
```

The server is stateless: it reads the active course pack's corpus database
and content files, and renders page images on demand. All personal study
state lives in the browser (localStorage), so deleting the repo checkout
never destroys study progress, and clearing site data resets it.

## Pack layout

A course pack lives at `~/.cramdex/courses/<slug>/` (override the home
directory with `CRAMDEX_HOME`). `~/.cramdex/config.yaml` names the
`active_course` slug the server resolves on every request.

```
<pack>/
├── course.yaml      # name, exam_date, books_dir, books: [{slug, label, filename}, ...]
├── glossary.md       # optional: | Term | Definition | <book label> p.N | table
├── acronyms.md        # optional, same table shape (or acronyms.tsv)
├── frameworks.md       # optional: named-model cards
├── slide-index.md       # optional: slide title registry
├── topics.yaml            # optional: quiz topic taxonomy (falls back to one theme per book)
├── notes/*.md               # optional: cheatsheets and running notes
├── labs/<book>/lab-*.md, lab-*-comparison.md, lab-*-*.csv
├── assets/*.png|.jpg|.pdf|.html
└── .corpus/                  # generated by scripts/build.sh: corpus.db, pages/, acronyms.tsv, .pdf_password
```

The book PDFs themselves live outside the pack, at the path named by
`books_dir` in `course.yaml` (or the `CRAMDEX_BOOKS_DIR` override).

## Environment variables

| Variable | Purpose | Default |
| --- | --- | --- |
| `CRAMDEX_HOME` | Where `config.yaml` and `courses/` live | `~/.cramdex` |
| `CRAMDEX_BOOKS_DIR` | Overrides the pack's `books_dir` for the source PDFs | the pack's `course.yaml` value |
| `CRAMDEX_PDF_PASSWORD` | PDF password, when the source PDFs are encrypted | the pack's `.corpus/.pdf_password` file |

Whichever source is used, the password is passed to poppler's `pdftotext`/
`pdftoppm` as a command-line argument during text extraction and page
rendering, so it is briefly visible to other processes on the same machine
via the process table (e.g. `ps`); this is an accepted limitation of poppler's
own CLI interface, acceptable on the single-user machines cramdex targets.

## LLM providers

Ask and AI quiz generation route through a pluggable LLM provider, configured
in `~/.cramdex/config.yaml` under an `llm:` block. All three providers speak
through the same interface (`app/server/llm/`), so switching providers is
just a config edit and, for the two API-based providers, an environment
variable.

| `provider` | Backend | Default model | Notes |
| --- | --- | --- | --- |
| `claude_cli` (default) | Local `claude` CLI, run as a sandboxed subprocess | resolved by the CLI itself | No API key needed; requires Claude Code installed and on `PATH` |
| `anthropic_api` | Anthropic Messages API via the official SDK | `claude-opus-4-8` | Requires `ANTHROPIC_API_KEY` |
| `openai_compatible` | Any OpenAI-compatible `/chat/completions` endpoint, via `httpx` | `gpt-4o-mini` | Requires `base_url`; works with Ollama, LM Studio, vLLM, or OpenAI itself |

If the `llm:` block is absent, or `provider` is unset, the app defaults to
`claude_cli`.

### Config shape

```yaml
llm:
  provider: claude_cli   # claude_cli (default) | anthropic_api | openai_compatible
  # model: ...            # optional override; falls back to the provider's default
  # base_url: ...         # required for openai_compatible; ignored by the others
```

### Environment variables

| Variable | Applies to | Purpose |
| --- | --- | --- |
| `ANTHROPIC_API_KEY` | `anthropic_api` | API key for the Anthropic Messages API |
| `CRAMDEX_LLM_API_KEY` | `openai_compatible` | API key for the endpoint, checked before `OPENAI_API_KEY` |
| `OPENAI_API_KEY` | `openai_compatible` | Fallback API key if `CRAMDEX_LLM_API_KEY` is not set |
| `CRAMDEX_LLM_MODEL` | any provider | Overrides `llm.model` from `config.yaml` |
| `CRAMDEX_LLM_BASE_URL` | any provider | Overrides `llm.base_url` from `config.yaml` |

### Example: local Ollama

```yaml
llm:
  provider: openai_compatible
  base_url: http://localhost:11434/v1
```

A typical local Ollama install needs no API key. Set `CRAMDEX_LLM_API_KEY`
if your endpoint requires one.

Check `GET /api/llm` at any time to see which provider is active and
whether it is configured.

### Privacy note

Ask and AI quiz send book excerpts from your course pack to whichever
provider is configured. The Claude CLI and the Anthropic API both send that
text to Anthropic. A local OpenAI-compatible endpoint, such as Ollama or LM
Studio running on localhost, keeps everything on-machine and sends nothing
off your network.

## Study data and persistence

All study state is client-side, in namespaced localStorage keys
(`cramdex.*`), managed by small typed stores (`src/stores/`) with runtime
validation (corrupt or foreign data falls back to a clean initial state
rather than crashing), immutable updates, cross-tab sync, and a
`useSyncExternalStore` React binding. Readiness math lives in
`src/stores/readiness.ts` as a pure function:
`round(0.4 * mean(book %) + 0.4 * mean(topic mastery, unattempted = 0) + 0.2 * labs done fraction)`.

To reset all progress, clear site data for `127.0.0.1:8553` (or remove the
`cramdex.*` keys in devtools).

## API

| Endpoint | Purpose |
| --- | --- |
| `GET /api/health` | prerequisite checks (course pack, corpus, poppler, claude CLI, books dir, PDF password) |
| `GET /api/course` | active pack's name, exam date, and book list |
| `GET /api/search?q=&book=&mode=&limit=` | FTS5 page search (phrase or or-mode) |
| `POST /api/ask` | SSE stream: grounded answer with page citations |
| `GET /api/page/{slug}/{page}.png` | rendered printed page image |
| `GET /api/content/books` | book list with real page counts |
| `GET /api/content/glossary` / `acronyms` / `frameworks` / `slide-index` / `topics` | parsed pack content |
| `GET /api/content/notes` | pack notes list (title, path) |
| `GET /api/content/labs` | lab groups with title, desc, write-up, comparison, CSVs |
| `GET /api/content/doc?path=` / `csv?path=` / `file?path=` | pack file access (allow-listed roots) |
| `GET /api/content/assets` | generated study media list |
| `GET /api/quiz/deck?source=` | flashcard deck from glossary/frameworks/acronyms |
| `POST /api/quiz/generate` | AI scenario questions via the claude CLI |

## Design system

Defined in `src/index.css` as Tailwind v4 `@theme` tokens: 12 colors
(bg, panel, panel-2, edge, edge-2, fg, muted, faint, cy, yl, rd, gn) plus dim
variants. Typography: Rajdhani for UI text, Share Tech Mono for system labels
and numbers, both self-hosted via Fontsource so the app works offline.
Reusable primitives live in `src/components/ui/`: `Panel` (corner brackets),
`ButtonPrimary` (yellow chamfer) / `ButtonSecondary`, `Bar` (flat neon
progress, dashed variant), `Eyebrow` / `MonoLabel`, `Pill`. Hard rules:
no border radius, no hover transforms, cards hover cyan, rows hover panel-2.

## Development

```bash
cd app/web
npm run dev        # Vite dev server (proxies /api to :8553)
npm test           # vitest unit suite
npm run build      # tsc + vite build (required before e2e)
npm run e2e        # Playwright (starts uvicorn against web/dist; skips without a corpus)
npm run lint       # oxlint

cd app/server
.venv/bin/python -m pytest tests/ -q
```

Testing note: Node's experimental `localStorage` global shadows jsdom's in
vitest, so a working in-memory polyfill is installed globally via
`src/test/setup.ts` (`src/stores/testLocalStorage.ts`). Tests that need clean
study state should clear localStorage and reset stores via their `set` in
`beforeEach`.

## Content policy

Course books are your own copyrighted courseware. They live outside the
repo, at the pack's `books_dir`, and the extracted corpus (the pack's
`.corpus/`) is gitignored. Nothing from the corpus is ever committed, and
the server binds to `127.0.0.1` only.
