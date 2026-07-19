# Changelog

All notable changes to cramdex are documented in this file. The format is
based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the
project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.1.0] - 2026-07-19

### Added

- Index print view options: A-Z letter sections with a "#" bucket, optional
  page break per letter, cover sheet with the book color legend, font size
  (S/M/L) and column (1/2) controls. Options persist locally.
- Printable reference pack at /reference/print: glossary, acronyms, and
  frameworks in a black-on-white print layout with per-section toggles.
- DOCX export of the exam index (letter headings, per-book colored
  citations, page-number footer), generated fully client-side via the new
  docx dependency.

### Changed

- The index print view sets the document title during printing so browser
  print headers show the course and index name.

## [1.0.1] - 2026-07-19

### Fixed

- The search page's book filter pills now derive from the active course
  instead of a fixed seven-book list left over from the app's original
  course layout. Packs with fewer or differently named books no longer
  show dead filter pills.

## [1.0.0] - 2026-07-18

Initial public release. Cramdex is built around studying SANS courses
and preparing a GIAC-style index for open-book certification exams, while
never containing any course material itself.

### Added

- Course-pack model: bring your own course PDFs. Packs live outside the
  repository under `~/.cramdex/courses/<slug>/`; the engine contains no
  course content.
- Guided setup wizard (`./setup.sh`): dependency checks, interactive book
  selection, encrypted-PDF password handling (stored with 0600 permissions
  or supplied via `CRAMDEX_PDF_PASSWORD`), corpus build, and LLM provider
  selection.
- Fictional demo course (`./setup.sh --demo`) so every feature can be
  evaluated without any real courseware.
- Full-text corpus search (SQLite FTS5) with a page-image reader, printed
  page citations, and reading progress tracking.
- Quiz decks built from the pack's glossary, frameworks, and acronyms,
  with optional AI-generated questions.
- Ask: grounded question answering over the corpus with pluggable LLM
  providers (Claude CLI, Anthropic API, OpenAI-compatible endpoints such
  as Ollama, LM Studio, and vLLM).
- Exam index builder: capture terms from search, the reader, or the page
  viewer; suggestions from extracted titles and acronyms plus optional AI
  assist, each requiring explicit approval; alphabetical manage view with
  filtering, inline editing, duplicate warnings, and per-book colors;
  print-optimized view; CSV and JSON export; JSON import including
  pack-provided sample indexes.
- Multi-course support with in-app course switching.
- Continuous integration mirrored step for step by `scripts/ci_local.sh`.

[1.1.0]: https://github.com/chris2ao/cramdex/releases/tag/v1.1.0
[1.0.1]: https://github.com/chris2ao/cramdex/releases/tag/v1.0.1
[1.0.0]: https://github.com/chris2ao/cramdex/releases/tag/v1.0.0
