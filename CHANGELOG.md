# Changelog

All notable changes to cramdex are documented in this file. The format is
based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the
project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2026-07-18

Initial public release.

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

[1.0.0]: https://github.com/chris2ao/cramdex/releases/tag/v1.0.0
