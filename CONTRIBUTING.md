# Contributing to cramdex

Thanks for your interest in improving cramdex.

## Getting started

```bash
git clone https://github.com/chris2ao/cramdex cramdex
cd cramdex
./setup.sh --demo
```

The demo course gives you a fully working instance with fictional content.
Useful commands while developing:

- Backend tests: `cd app/server && .venv/bin/python -m pytest tests/ -q`
- Web tests: `cd app/web && npm test -- --run`
- Lint: `cd app/web && npm run lint`
- Full CI mirror (backend, web, e2e): `bash scripts/ci_local.sh`

## Ground rules

- **Never include real course material** (SANS or otherwise) in issues, pull requests, code,
  fixtures, screenshots, or commit messages. That includes book titles,
  glossary terms, slide text, and course identifiers. All reference
  content must be fictional; the demo course shows the pattern.
  Contributions containing copyrighted courseware will be closed.
- Run `bash scripts/ci_local.sh` before opening a pull request; it mirrors
  CI step for step.
- Behavior changes come with tests.
- Be respectful and constructive in all project spaces.

## Pull requests

1. Fork the repository and branch from `main`.
2. Make your change with tests, keeping commits in conventional style
   (`feat:`, `fix:`, `docs:`, `chore:`, `test:`, `refactor:`).
3. Open a pull request against `main` and fill in the template.

## Bugs and feature requests

Use the issue templates. For security problems, do not open a public
issue; see [SECURITY.md](SECURITY.md).

## Versioning and releases

The project uses [Semantic Versioning](https://semver.org). Releases are
tagged `vX.Y.Z` on `main` and published as GitHub Releases, with notes
maintained in [CHANGELOG.md](CHANGELOG.md).
