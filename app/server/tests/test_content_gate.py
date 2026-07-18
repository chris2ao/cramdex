"""Repo-wide gate: no course-identifying strings in tracked files.

The pattern list is deliberately NOT part of the repository: the strings
that identify a real course are themselves content that must never ship.
The gate reads `.content-gate.local` at the repo root (gitignored, one
case-insensitive regex per line, `#` comments and blank lines ignored).
When the file is absent or empty, for example in a fresh public clone or
in CI, the gate skips: there is nothing local to protect. Course-pack
authors can create their own list so their private material can never
creep into a commit.
"""
from __future__ import annotations

import re
import subprocess
from pathlib import Path

import pytest

import config

GATE_FILE = ".content-gate.local"


def load_gate_pattern_from_lines(lines: list[str]) -> re.Pattern[str]:
    return re.compile(
        "|".join(f"(?:{term})" for term in lines), re.IGNORECASE)


def load_gate_pattern(path: Path) -> re.Pattern[str] | None:
    """Compiles the gate file into one alternation; None when absent/empty."""
    if not path.is_file():
        return None
    lines = [ln.strip() for ln in path.read_text(encoding="utf-8").splitlines()]
    terms = [ln for ln in lines if ln and not ln.startswith("#")]
    if not terms:
        return None
    return load_gate_pattern_from_lines(terms)


def scan_tracked_files(repo_root: Path, pattern: re.Pattern[str],
                       tracked: list[str]) -> list[str]:
    offenders: list[str] = []
    for rel_path in tracked:
        path = repo_root / rel_path
        if not path.is_file():
            continue
        try:
            text = path.read_text(encoding="utf-8")
        except (UnicodeDecodeError, OSError):
            continue  # binary or unreadable file, nothing to scan
        if pattern.search(text):
            offenders.append(rel_path)
    return offenders


def _tracked_files() -> list[str]:
    result = subprocess.run(
        ["git", "ls-files"],
        cwd=config.REPO_ROOT,
        capture_output=True,
        text=True,
        check=True,
    )
    return [line for line in result.stdout.splitlines() if line.strip()]


def test_no_course_identifying_strings_in_tracked_files():
    pattern = load_gate_pattern(config.REPO_ROOT / GATE_FILE)
    if pattern is None:
        pytest.skip(
            f"no {GATE_FILE} at the repo root; nothing local to gate")
    offenders = scan_tracked_files(
        config.REPO_ROOT, pattern, _tracked_files())
    assert offenders == [], (
        "course-identifying strings found in tracked files: "
        f"{offenders}")


def test_load_gate_pattern_absent_returns_none(tmp_path):
    assert load_gate_pattern(tmp_path / "missing.local") is None


def test_load_gate_pattern_comments_and_blanks_only_returns_none(tmp_path):
    f = tmp_path / "gate.local"
    f.write_text("# just a comment\n\n   \n", encoding="utf-8")
    assert load_gate_pattern(f) is None


def test_load_gate_pattern_compiles_case_insensitive_alternation(tmp_path):
    f = tmp_path / "gate.local"
    f.write_text("# private terms\nmoonbase[- ]?omega\nquiet-crater\n", encoding="utf-8")
    pattern = load_gate_pattern(f)
    assert pattern is not None
    assert pattern.search("saw MOONBASE OMEGA in notes")
    assert pattern.search("the Quiet-Crater file")
    assert not pattern.search("nothing to see")


def test_scan_tracked_files_flags_hits_and_skips_binary(tmp_path):
    (tmp_path / "clean.txt").write_text("all good", encoding="utf-8")
    (tmp_path / "dirty.txt").write_text("mentions quiet-crater here", encoding="utf-8")
    (tmp_path / "blob.bin").write_bytes(b"\xff\xfe\x00quiet-crater")
    pattern = load_gate_pattern_from_lines(["quiet-crater"])
    offenders = scan_tracked_files(
        tmp_path, pattern, ["clean.txt", "dirty.txt", "blob.bin", "gone.txt"])
    assert offenders == ["dirty.txt"]


def test_gate_file_is_gitignored():
    result = subprocess.run(
        ["git", "check-ignore", "-q", GATE_FILE],
        cwd=config.REPO_ROOT)
    assert result.returncode == 0, f"{GATE_FILE} must be gitignored"
