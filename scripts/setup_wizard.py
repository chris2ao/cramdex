#!/usr/bin/env python3
"""setup_wizard.py: pure/IO-injected core library for the guided
`./setup.sh` course-pack setup flow.

Every function that touches the outside world (subprocess, stdin/stdout,
the filesystem) takes that dependency as an injectable parameter with a
real default, so every branch is unit-testable with fakes and no real
subprocess or network call ever runs in tests.

This module is always invoked with the backend venv's Python from the
repo root (setup.sh execs `app/server/.venv/bin/python
scripts/setup_wizard.py "$@"`), so the sys.path insertion below is safe:
app/server always exists at a fixed, predictable relative location.
This is the same sys.path arrangement app/server/tests/test_demo_generator.py
and test_pack_manifest.py use to import scripts/ modules, mirrored in the
other direction (a scripts/ module importing an app/server module).

The interactive main() entry point (argument parsing, the full prompt
sequence, corpus/frontend build, closing summary) lives at the bottom of
this file, below the library functions it is built from. Every prompt and
print goes through an injected input_fn/print_fn/getpass_fn (real defaults:
input, print, getpass.getpass), so the whole flow is scriptable via stdin
with no real terminal needed; an EOFError from any prompt (stdin closed)
propagates uncaught up to main(), which reports it with a pointer at
`--demo`, the only non-interactive path.
"""
from __future__ import annotations

import argparse
import getpass
import os
import re
import shutil
import subprocess
import sys
from pathlib import Path

_REPO_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(_REPO_ROOT / "app" / "server"))

import yaml  # noqa: E402

import config  # noqa: E402

_HELP_TEXT = (
    "Commands: [a]ccept | r N NEWLABEL (rename) | m N P (move N to "
    "position P) | x N (exclude) | u (undo last exclude)")

_LLM_DESCRIPTIONS = {
    "claude_cli": "Local `claude` CLI, run as a sandboxed subprocess "
                  "(no API key needed)",
    "anthropic_api": "Anthropic Messages API via the official SDK "
                      "(requires ANTHROPIC_API_KEY)",
    "openai_compatible": "Any OpenAI-compatible /chat/completions "
                          "endpoint: Ollama, LM Studio, vLLM, or OpenAI "
                          "itself (requires a base URL)",
}


class WizardError(RuntimeError):
    """Raised for actionable, user-facing setup wizard failures. The
    message is written to be shown to the user as-is (no stack trace
    needed): it always names the offending file, slug, or condition."""


def scan_pdfs(books_dir: Path) -> list[Path]:
    """Every *.pdf (case-insensitive) directly inside books_dir, sorted by
    filename. Non-recursive: subdirectories are never descended into. A
    missing or non-directory books_dir yields an empty list rather than
    raising, same as a directory with no PDFs in it; the caller (the
    interactive flow) is responsible for treating an empty result as its
    own error case (e.g. re-prompting for a different folder) since a
    books folder that exists but is momentarily empty during setup is not
    itself a library-level failure.
    """
    if not books_dir.is_dir():
        return []
    return sorted(
        (p for p in books_dir.iterdir()
         if p.is_file() and p.suffix.lower() == ".pdf"),
        key=lambda p: p.name,
    )


def probe_encryption(pdf: Path, password: str | None = None,
                      runner=subprocess.run) -> str:
    """Classify a PDF's encryption/password state by running `pdftotext
    -l 1 <pdf> <devnull>` (plus `-upw <password>` when password is given)
    with a 30s timeout, discarding the extracted text (output goes to
    os.devnull; this function only cares about the exit status).

    Returns one of:
      "ok"                the page rendered; no password needed, or the
                           supplied password was correct
      "password_required" nonzero exit, stderr mentions a password, and no
                           password was supplied
      "bad_password"      nonzero exit, stderr mentions a password, and a
                           password WAS supplied (it was wrong)
      "error"              any other nonzero exit, pdftotext missing
                           (FileNotFoundError), or a timeout

    Some poppler builds word the "no password given" and "wrong password
    given" cases identically (both "Command Line Error: Incorrect
    password", rather than distinguishing "a password is required" from
    "that password is wrong"), so this function cannot always tell them
    apart from stderr text alone; it falls back to whether *this call*
    supplied a password to pick "password_required" vs "bad_password".
    Callers that retry after a failure (obtain_password) must treat the
    two as equivalent rather than branching on which one came back.
    """
    cmd = ["pdftotext", "-l", "1"]
    if password is not None:
        cmd += ["-upw", password]
    cmd += [str(pdf), os.devnull]
    try:
        result = runner(cmd, capture_output=True, text=True, timeout=30)
    except (FileNotFoundError, subprocess.TimeoutExpired):
        return "error"
    if result.returncode == 0:
        return "ok"
    stderr = (result.stderr or "").lower()
    if "password" in stderr:
        return "bad_password" if password is not None else "password_required"
    return "error"


def detect_pack_encryption(pdfs: list[Path], probe=probe_encryption) -> str:
    """Probe every PDF (no password: only encrypted-or-not detection is
    needed here) and require the whole pack to agree: all encrypted, or
    all unencrypted. Raises WizardError naming the differing files on a
    mixed pack, or naming the file a probe could not classify at all
    ("error": corrupt PDF, missing pdftotext, or a timeout).
    """
    status_by_pdf: dict[Path, str] = {}
    for pdf in pdfs:
        classification = probe(pdf)
        if classification == "ok":
            status_by_pdf[pdf] = "unencrypted"
        elif classification in ("password_required", "bad_password"):
            status_by_pdf[pdf] = "encrypted"
        else:
            raise WizardError(
                f"Could not determine whether {pdf.name} is encrypted "
                "(pdftotext probe failed: corrupt PDF, pdftotext not "
                "installed, or a timeout). Fix or remove this file and "
                "re-run the scan.")

    statuses = set(status_by_pdf.values())
    if len(statuses) > 1:
        encrypted = sorted(p.name for p, s in status_by_pdf.items()
                            if s == "encrypted")
        unencrypted = sorted(p.name for p, s in status_by_pdf.items()
                              if s == "unencrypted")
        raise WizardError(
            "This pack mixes encrypted and unencrypted PDFs; encryption "
            "must be uniform across the whole pack. Encrypted: "
            f"{', '.join(encrypted)}. Unencrypted: {', '.join(unencrypted)}."
        )
    return "encrypted" if "encrypted" in statuses else "unencrypted"


def _slugify(label: str) -> str:
    """Lowercase alphanumerics only: every other character (spaces,
    punctuation, unicode) is dropped, not replaced, matching the plan's
    "lowercase alnum, spaces to nothing" wording exactly."""
    return re.sub(r"[^a-z0-9]", "", label.lower())


_DIGITS_ONLY = re.compile(r"^\d+$")


def _parse_index(token: str, count: int) -> int | None:
    """Parse a 1-based user-facing book number into a 0-based index valid
    for a list of length count, or None if token isn't a valid number in
    range. Only a bare run of digits matches (no sign at all): the
    earlier `token.strip().lstrip("-").isdigit()` check let a
    multiply-signed token like "--5" through (lstrip strips every
    leading '-', so "--5" -> "5" -> isdigit() True) and then crashed
    uncaught on int("--5") (ValueError: invalid literal), killing the
    whole interactive session and losing all progress. A single leading
    "-" is also rejected outright here rather than parsed and then
    range-checked, since a book number is never negative.
    """
    token = token.strip()
    if not _DIGITS_ONLY.match(token):
        return None
    n = int(token)
    if n < 1 or n > count:
        return None
    return n - 1


def _finalize_book_plan(active: list[dict]) -> tuple[list[dict] | None, str | None]:
    """Build the final {"slug","label","filename"} list from the active
    working list, or return (None, error_message) when a book renamed by
    hand slugifies to nothing (all-punctuation label) or two books land on
    the same slug (a hand-renamed label colliding with another renamed
    label or with an unrenamed book's positional "bookN" slug)."""
    final: list[dict] = []
    owner_by_slug: dict[str, str] = {}
    problems: list[str] = []
    for position, book in enumerate(active, start=1):
        if book["renamed"]:
            slug = _slugify(book["label"])
            if not slug:
                problems.append(
                    f"label {book['label']!r} has no letters or digits to "
                    "build a slug from; rename it to something else")
                continue
        else:
            slug = f"book{position}"
        if slug in owner_by_slug:
            problems.append(
                f"slug '{slug}' would be shared by {owner_by_slug[slug]!r} "
                f"and {book['label']!r}; rename one of them")
            continue
        owner_by_slug[slug] = book["label"]
        final.append({"slug": slug, "label": book["label"],
                      "filename": book["filename"]})
    if problems:
        return None, "; ".join(problems)
    return final, None


def prompt_book_plan(pdfs: list[Path], input_fn=input, print_fn=print) -> list[dict]:
    """Interactive book-plan editor. Proposes the scan order with labels
    "Book 1".."Book N" and slugs "book1".."bookN", then loops reading
    commands (see _HELP_TEXT) until "a" is accepted. Returns the confirmed
    [{"slug","label","filename"}, ...] in final order.

    Command numbers (N, and the move target P) always refer to the
    CURRENT on-screen position in the active (non-excluded) list, which is
    renumbered every time the list changes. Excluding a book remembers
    its position so "u" (undo) can put it back close to where it was;
    "u" only ever undoes the most recently excluded book (a single-level
    undo stack), not a specific one by number.
    """
    active: list[dict] = [
        {"slug": f"book{i}", "label": f"Book {i}",
         "filename": pdf.name, "renamed": False}
        for i, pdf in enumerate(pdfs, start=1)
    ]
    excluded_stack: list[tuple[int, dict]] = []

    while True:
        print_fn("")
        print_fn("Book plan:")
        if not active:
            print_fn("  (no books remain; undo an exclude or accept will "
                      "be rejected)")
        for i, book in enumerate(active, start=1):
            stem = Path(book["filename"]).stem
            print_fn(f"  {i}. {book['label']}  [{stem}]")
        print_fn(_HELP_TEXT)

        raw = input_fn("> ").strip()
        tokens = raw.split(maxsplit=2)
        cmd = tokens[0].lower() if tokens else ""

        if cmd == "a" and len(tokens) == 1:
            if not active:
                print_fn("At least one book is required to accept.")
                continue
            final, problem = _finalize_book_plan(active)
            if problem:
                print_fn(f"Cannot accept: {problem}.")
                continue
            return final

        if cmd == "x" and len(tokens) == 2:
            idx = _parse_index(tokens[1], len(active))
            if idx is None:
                print_fn(f"Invalid book number: {tokens[1]!r}. {_HELP_TEXT}")
                continue
            book = active.pop(idx)
            excluded_stack.append((idx, book))
            continue

        if cmd == "u" and len(tokens) == 1:
            if not excluded_stack:
                print_fn("Nothing to undo.")
                continue
            idx, book = excluded_stack.pop()
            active.insert(min(idx, len(active)), book)
            continue

        if cmd == "m" and len(tokens) == 3:
            idx = _parse_index(tokens[1], len(active))
            target_token = tokens[2].strip()
            if idx is None or not target_token.isdigit():
                print_fn(f"Invalid move command: {raw!r}. {_HELP_TEXT}")
                continue
            target = int(target_token)
            if not (1 <= target <= len(active)):
                print_fn(f"Invalid target position: {target}. {_HELP_TEXT}")
                continue
            book = active.pop(idx)
            active.insert(target - 1, book)
            continue

        if cmd == "r" and len(tokens) == 3:
            idx = _parse_index(tokens[1], len(active))
            if idx is None:
                print_fn(f"Invalid book number: {tokens[1]!r}. {_HELP_TEXT}")
                continue
            new_label = tokens[2].strip()
            if not new_label:
                print_fn("New label cannot be empty.")
                continue
            active[idx] = {**active[idx], "label": new_label, "renamed": True}
            continue

        print_fn(f"Unrecognized command: {raw!r}. {_HELP_TEXT}")


def obtain_password(first_encrypted_pdf: Path, getpass_fn=getpass.getpass,
                     probe=probe_encryption, print_fn=print,
                     max_attempts: int = 3) -> str:
    """Prompt (hidden input) for the pack password, validating it against
    first_encrypted_pdf via probe before returning it. Re-prompts on any
    non-"ok" probe result (password_required and bad_password are treated
    as equivalent retry cases, per probe_encryption's docstring, and
    "error" also just consumes an attempt rather than failing fast, since
    a flaky/slow probe should not be fatal on its own). An empty password
    counts as a used attempt with its own distinct message. Raises
    WizardError, naming the file and the attempt count, once max_attempts
    is exhausted. The password itself never appears in any message this
    function prints or raises.
    """
    for _attempt in range(1, max_attempts + 1):
        password = getpass_fn(f"Password for {first_encrypted_pdf.name}: ")
        if not password:
            print_fn("Password cannot be empty.")
            continue
        if probe(first_encrypted_pdf, password) == "ok":
            return password
        print_fn("That password did not work. Try again.")
    raise WizardError(
        f"Could not unlock {first_encrypted_pdf.name} after {max_attempts} "
        "attempts. Re-run setup once you have the correct password, or "
        "set CRAMDEX_PDF_PASSWORD in the environment instead.")


def write_pack(home: Path, slug: str, name: str, books_dir: Path,
               books: list[dict], encrypted: bool, password: str | None,
               force: bool = False) -> Path:
    """Write home/courses/<slug>/course.yaml (name, absolute books_dir,
    encrypted, books) and, when password is not None,
    <pack>/.corpus/.pdf_password created mode 0600 (os.open, never a
    write_text() call that could race with a wider default umask).

    Refuses to touch an existing pack directory unless force=True, in
    which case ONLY that pack directory is removed (shutil.rmtree scoped
    to home/courses/<slug>) before writing: no sibling pack or other
    home/config.yaml key is ever touched here. This mirrors
    make_demo_pack.build_demo_pack's confirm-then-force contract: this
    function takes the already-decided force flag, it never prompts
    itself.

    slug must pass config.is_simple_slug (the same lexical, path-
    traversal-safe check config.set_active_course uses): a WizardError is
    raised otherwise, before anything is written.
    """
    if not config.is_simple_slug(slug):
        raise WizardError(
            f"Invalid course slug: {slug!r}. Use a single path-safe "
            "component: not empty, not '.' or '..', and no path "
            "separator.")

    pack = home / "courses" / slug
    if pack.exists():
        if not force:
            raise WizardError(
                f"Course pack already exists: {pack}. Confirm the "
                "overwrite and re-run with force to replace it.")
        shutil.rmtree(pack)

    pack.mkdir(parents=True)
    course = {
        "name": name,
        "books_dir": str(Path(books_dir).resolve()),
        "encrypted": encrypted,
        "books": list(books),
    }
    (pack / "course.yaml").write_text(
        yaml.safe_dump(course, sort_keys=False), encoding="utf-8")

    if password is not None:
        corpus = pack / ".corpus"
        corpus.mkdir(parents=True, exist_ok=True)
        pw_path = corpus / ".pdf_password"
        fd = os.open(str(pw_path), os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
        try:
            os.write(fd, (password + "\n").encode("utf-8"))
        finally:
            os.close(fd)

    return pack


def _match_llm_choice(raw: str) -> str | None:
    if raw in config.LLM_PROVIDERS:
        return raw
    if raw.isdigit():
        idx = int(raw) - 1
        if 0 <= idx < len(config.LLM_PROVIDERS):
            return config.LLM_PROVIDERS[idx]
    return None


def choose_llm(input_fn=input, print_fn=print, which=shutil.which) -> dict | None:
    """Present config.LLM_PROVIDERS as a numbered menu with one-line
    descriptions and collect the `llm:` config.yaml block (provider, plus
    an optional model/base_url), or None if the user skips ("s").

    Empty input (just Enter) defaults to claude_cli ONLY when `claude` is
    detected on PATH (via `which`); otherwise it re-prompts, explicitly
    asking the user to choose since there is no safe default to fall back
    to. Never collects or prints an API key: for anthropic_api and
    openai_compatible this only prints the name of the environment
    variable to set it in, matching the "keys live in the environment,
    never in config.yaml" rule the rest of the app already follows.
    """
    detected = bool(which("claude"))
    print_fn("Choose an LLM provider:")
    for i, provider in enumerate(config.LLM_PROVIDERS, start=1):
        suffix = " [default, detected on PATH]" if (
            provider == "claude_cli" and detected) else ""
        print_fn(f"  {i}. {provider}{suffix} - {_LLM_DESCRIPTIONS[provider]}")
    print_fn("  s. Skip (configure config.yaml's llm: block later)")

    while True:
        raw = input_fn("> ").strip()

        if raw.lower() == "s":
            return None

        if raw == "":
            if detected:
                return {"provider": "claude_cli"}
            print_fn("No default available: `claude` was not found on "
                      "PATH. Choose a provider explicitly (number or name).")
            continue

        choice = _match_llm_choice(raw)
        if choice is None:
            print_fn(f"Unrecognized choice: {raw!r}. Enter a number, a "
                      "provider name, or 's' to skip.")
            continue

        if choice == "claude_cli":
            return {"provider": "claude_cli"}

        if choice == "anthropic_api":
            model = input_fn(
                f"Model [{config.DEFAULT_ANTHROPIC_MODEL}]: ").strip()
            print_fn("Set ANTHROPIC_API_KEY in your environment before "
                      "running cramdex (never stored in config.yaml).")
            block = {"provider": "anthropic_api"}
            if model:
                block["model"] = model
            return block

        # openai_compatible
        base_url = ""
        while not base_url:
            base_url = input_fn("Base URL (required): ").strip()
            if not base_url:
                print_fn("A base URL is required for openai_compatible.")
        model = input_fn("Model (optional): ").strip()
        print_fn("Set CRAMDEX_LLM_API_KEY (or OPENAI_API_KEY) in your "
                  "environment before running cramdex (never stored in "
                  "config.yaml).")
        block = {"provider": "openai_compatible", "base_url": base_url}
        if model:
            block["model"] = model
        return block


# --- interactive flow -------------------------------------------------------

def prompt_course_name(input_fn=input, print_fn=print) -> str:
    """Prompt for a nonempty course name, re-prompting until one is given
    (whitespace-only input counts as empty)."""
    while True:
        name = input_fn("Course name: ").strip()
        if name:
            return name
        print_fn("Course name cannot be empty.")


def _propose_slug(name: str) -> str:
    """Slugify a course name into a proposed pack slug (see _slugify),
    falling back to 'course1' when the name has no letters or digits to
    build a slug from (e.g. a name that is entirely punctuation)."""
    return _slugify(name) or "course1"


_SLUG_FORMAT = re.compile(r"^[a-z0-9-]+$")


def prompt_course_slug(name: str, home: Path, input_fn=input,
                        print_fn=print) -> tuple[str, bool]:
    """Propose a slug from the course name (see _propose_slug), let the
    user accept it (blank input) or type a different one, and confirm
    before overwriting a pack that already exists at that slug. Returns
    (slug, force): force is True only when the user explicitly confirmed
    overwriting an existing pack, and is the value write_pack's own
    force parameter should be called with.

    The edited value is lowercased, then checked against _SLUG_FORMAT
    (lowercase letters, digits, and dashes only) as well as
    config.is_simple_slug, re-prompting on either failure. Both checks
    are needed: is_simple_slug alone is a purely lexical path-safety
    check (it rejects empty/"."/".."/embedded separators, nothing more)
    that would silently accept a slug containing a space or uppercase
    letters, which contradicts this function's own re-prompt message
    below. is_simple_slug remains the actual path-traversal safety net
    (also re-applied, unconditionally, by write_pack itself); the
    _SLUG_FORMAT check is this function's own stricter UX-level contract
    so that message stays true.
    """
    proposed = _propose_slug(name)
    while True:
        raw = input_fn(f"Course slug [{proposed}]: ").strip()
        slug = (raw or proposed).lower()
        if not _SLUG_FORMAT.match(slug) or not config.is_simple_slug(slug):
            print_fn(f"Invalid slug: {slug!r}. Use a single path-safe "
                      "component: letters/digits/dashes, no spaces, no "
                      "path separators, not '.' or '..'.")
            continue
        pack = home / "courses" / slug
        if not pack.exists():
            return slug, False
        confirm = input_fn(
            f"Course pack '{slug}' already exists at {pack}. Overwrite "
            "it? [y/N]: ").strip().lower()
        if confirm in ("y", "yes"):
            return slug, True
        print_fn("Choose a different slug.")


def prompt_books_dir(input_fn=input, print_fn=print,
                      scan=scan_pdfs) -> tuple[Path, list[Path]]:
    """Prompt for the books folder, re-prompting until it names a real
    directory containing at least one PDF (per scan). The re-prompt
    message on an empty scan reports the count found (always 0, since a
    nonzero scan returns immediately) so the user can tell this case
    apart from a typo'd path.
    """
    while True:
        raw = input_fn("Books folder (containing your course PDFs): ").strip()
        if not raw:
            print_fn("A books folder is required.")
            continue
        books_dir = Path(raw).expanduser()
        if not books_dir.is_dir():
            print_fn(f"Not a directory: {books_dir}")
            continue
        pdfs = scan(books_dir)
        if not pdfs:
            print_fn(f"No PDF files found in {books_dir} (0 found). Add "
                      "your course PDFs there, or point at a different "
                      "folder.")
            continue
        return books_dir, pdfs


def _write_llm_block(home: Path, block: dict) -> None:
    """Merge an `llm:` block into home/config.yaml, preserving every
    other existing key. Same yaml.safe_load/safe_dump round-trip
    config.set_active_course and make_demo_pack.build_demo_pack use for
    their own writes: any comments in that file are dropped, but every
    other key survives. Non-dict existing content is replaced with a
    fresh mapping, matching config._home_config's own coercion.
    """
    cfg = home / "config.yaml"
    if cfg.is_file():
        data = yaml.safe_load(cfg.read_text(encoding="utf-8")) or {}
        if not isinstance(data, dict):
            data = {}
    else:
        data = {}
    data = {**data, "llm": block}
    cfg.write_text(yaml.safe_dump(data, sort_keys=False), encoding="utf-8")


def _stream_subprocess(cmd: list[str], cwd: Path, print_fn=print) -> int:
    """Run cmd with its combined stdout/stderr streamed line by line
    through print_fn as it is produced (not buffered until exit), so a
    long-running step (corpus build, npm install) shows progress rather
    than appearing all at once when it finishes. Returns the process's
    exit code.
    """
    proc = subprocess.Popen(
        cmd, cwd=str(cwd), stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
        text=True, bufsize=1)
    if proc.stdout is None:
        # Unreachable in practice (stdout=subprocess.PIPE was requested
        # above, so Popen always attaches a pipe), but an explicit check
        # here fails loudly with a clear message instead of an assert
        # that -O strips and that mypy/type-checkers read as a narrowing
        # hint rather than a real runtime guard.
        raise RuntimeError(
            f"subprocess.Popen({cmd!r}) did not attach a stdout pipe")
    try:
        for line in proc.stdout:
            print_fn(line.rstrip("\n"))
    finally:
        proc.stdout.close()
    return proc.wait()


def build_arg_parser() -> argparse.ArgumentParser:
    ap = argparse.ArgumentParser(
        prog="setup.sh",
        description="Guided cramdex course-pack setup.")
    ap.add_argument(
        "--demo", action="store_true",
        help="build the fictional MOON-101 demo course pack instead of "
             "running the interactive course setup")
    ap.add_argument(
        "--force", action="store_true",
        help="rebuild the demo pack without confirming, when it already "
             "exists (demo path only; the interactive path always asks "
             "before overwriting an existing pack)")
    ap.add_argument(
        "--rebuild-web", action="store_true",
        help="rebuild app/web/dist even if it already exists")
    return ap


def _run_demo(home: Path, force: bool, *, print_fn=print,
              input_fn=input) -> Path:
    """--demo path: build (or confirm-then-rebuild) the fictional demo
    pack via make_demo_pack.build_demo_pack, then hand back to the
    shared tail. Imported locally (not at module level) because
    make_demo_pack is only needed on this path."""
    from make_demo_pack import build_demo_pack

    pack = home / "courses" / "demo"
    if pack.exists() and not force:
        try:
            confirm = input_fn(
                f"Demo pack already exists at {pack}. Rebuild it? "
                "[y/N]: ").strip().lower()
        except EOFError as exc:
            raise WizardError(
                "No input available (stdin closed) to confirm rebuilding "
                f"the existing demo pack at {pack}. Re-run with --force "
                "to rebuild it non-interactively: bash setup.sh --demo "
                "--force") from exc
        if confirm not in ("y", "yes"):
            print_fn("Keeping the existing demo pack.")
            return pack
        force = True
    return build_demo_pack(home, force=force)


def _run_interactive(home: Path, *, print_fn=print, input_fn=input,
                      getpass_fn=getpass.getpass, which=shutil.which,
                      probe=probe_encryption) -> Path:
    """Interactive course setup: name, slug, books folder, book plan,
    encryption detection and password, write the pack, activate it, and
    offer LLM provider setup. Every prompt is read via input_fn/
    getpass_fn (defaults to the real input()/getpass.getpass()); an
    EOFError from any of them (stdin closed) propagates uncaught to
    main(), which reports it with the --demo pointer.
    """
    print_fn("== cramdex interactive setup ==")
    print_fn("(Ctrl-D / closed stdin at any prompt exits; see --demo for "
              "a non-interactive quickstart.)")
    print_fn("")

    name = prompt_course_name(input_fn=input_fn, print_fn=print_fn)
    slug, force = prompt_course_slug(name, home, input_fn=input_fn,
                                      print_fn=print_fn)
    books_dir, pdfs = prompt_books_dir(input_fn=input_fn, print_fn=print_fn)
    book_plan = prompt_book_plan(pdfs, input_fn=input_fn, print_fn=print_fn)

    included = [books_dir / b["filename"] for b in book_plan]
    encryption = detect_pack_encryption(included, probe=probe)
    password = None
    rel_pw_path = Path("courses") / slug / ".corpus" / ".pdf_password"
    if encryption == "encrypted":
        print_fn(
            f"This course's PDFs are password protected: the password "
            f"will be validated, then stored at {rel_pw_path} under your "
            "CRAMDEX_HOME (mode 600, readable only by you). Set "
            "CRAMDEX_PDF_PASSWORD in the environment instead if you "
            "would rather not store it on disk.")
        password = obtain_password(
            included[0], getpass_fn=getpass_fn, probe=probe,
            print_fn=print_fn)

    pack = write_pack(home, slug, name, books_dir, book_plan,
                       encrypted=(encryption == "encrypted"),
                       password=password, force=force)
    print_fn(f"Course pack written: {pack}")
    if password is not None:
        print_fn(
            f"Password stored at {rel_pw_path} (mode 600). Set "
            "CRAMDEX_PDF_PASSWORD in the environment instead if you "
            "would rather not store it on disk.")

    config.set_active_course(slug)
    print_fn(f"Active course set to '{slug}'.")

    llm_block = choose_llm(input_fn=input_fn, print_fn=print_fn, which=which)
    if llm_block is not None:
        _write_llm_block(home, llm_block)
        print_fn(f"LLM provider set to '{llm_block['provider']}'.")
    else:
        print_fn("LLM provider setup skipped; configure config.yaml's "
                  "llm: block later.")

    return pack


def _shared_tail(pack: Path, rebuild_web: bool, *, print_fn=print,
                  run_stream=_stream_subprocess) -> int:
    """Corpus build, then frontend build when needed, then the closing
    summary. Shared by both the --demo path and the interactive path.
    Returns the process exit code: 0 on success, 2 on a corpus build
    failure, 3 on a frontend build failure.
    """
    print_fn("")
    print_fn("== Building corpus ==")
    code = run_stream(["bash", str(_REPO_ROOT / "scripts" / "build.sh")],
                       cwd=_REPO_ROOT, print_fn=print_fn)
    if code != 0:
        print_fn("")
        print_fn(f"Corpus build failed (exit {code}). Fix the error above, "
                  "then re-run: bash scripts/build.sh")
        return 2

    web_dir = _REPO_ROOT / "app" / "web"
    web_index = web_dir / "dist" / "index.html"
    if rebuild_web or not web_index.is_file():
        print_fn("")
        print_fn("== Building web frontend ==")
        if not (web_dir / "node_modules").is_dir():
            code = run_stream(["npm", "install"], cwd=web_dir,
                               print_fn=print_fn)
            if code != 0:
                print_fn("")
                print_fn(f"npm install failed (exit {code}). Fix the "
                          "error above, then re-run: (cd app/web && npm "
                          "install)")
                return 3
        code = run_stream(["npm", "run", "build"], cwd=web_dir,
                           print_fn=print_fn)
        if code != 0:
            print_fn("")
            print_fn(f"npm run build failed (exit {code}). Fix the error "
                      "above, then re-run: (cd app/web && npm run build)")
            return 3
    else:
        print_fn("")
        print_fn(f"Web frontend already built ({web_index}); skipping. "
                  "Pass --rebuild-web to force a rebuild.")

    print_fn("")
    print_fn("== Setup complete ==")
    print_fn(f"Course pack: {pack}")
    print_fn("")
    print_fn("Launch cramdex:")
    print_fn("  bash app/run.sh")
    print_fn("")
    print_fn("Try the fictional demo course any time with:")
    print_fn("  bash setup.sh --demo")
    print_fn("AI features (Ask, Quiz) work once an LLM provider is "
              "configured: re-run setup, or edit the llm: block in "
              f"{pack.parent.parent / 'config.yaml'} directly.")
    return 0


def main(argv: list[str] | None = None, *, input_fn=input, print_fn=print,
         getpass_fn=getpass.getpass, which=shutil.which,
         probe=probe_encryption, run_stream=_stream_subprocess) -> int:
    args = build_arg_parser().parse_args(argv)
    home = config.cramdex_home()
    home.mkdir(parents=True, exist_ok=True)

    try:
        if args.demo:
            pack = _run_demo(home, args.force, print_fn=print_fn,
                              input_fn=input_fn)
        else:
            pack = _run_interactive(
                home, print_fn=print_fn, input_fn=input_fn,
                getpass_fn=getpass_fn, which=which, probe=probe)
    except EOFError:
        print_fn("")
        print_fn("No input available (stdin closed) at a setup prompt.")
        print_fn("Run the non-interactive quickstart instead: "
                  "bash setup.sh --demo")
        return 1
    except WizardError as exc:
        print_fn(f"Setup failed: {exc}")
        return 1

    return _shared_tail(pack, args.rebuild_web, print_fn=print_fn,
                         run_stream=run_stream)


if __name__ == "__main__":
    sys.exit(main())
