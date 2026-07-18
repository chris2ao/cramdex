"""setup_wizard core library: pure/IO-injected functions behind the guided
`./setup.sh` flow. No real subprocess or network call happens anywhere in
this file: subprocess.run, input, getpass, and shutil.which are all
replaced with fakes."""
import os
import stat
import subprocess
import sys
from pathlib import Path

import pytest
import yaml

REPO_ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(REPO_ROOT / "scripts"))

import setup_wizard  # noqa: E402
import config  # noqa: E402


def make_input(lines):
    """Fake input()/getpass() that yields each line in turn, raising a
    clear assertion (not a confusing StopIteration) if a test's scripted
    session under-provisions responses."""
    it = iter(lines)

    def _input(prompt=""):
        try:
            return next(it)
        except StopIteration:
            raise AssertionError(f"input exhausted; last prompt was {prompt!r}")
    return _input


def make_recorder():
    calls = []

    def _print(*args, **kwargs):
        calls.append(" ".join(str(a) for a in args))
    return _print, calls


def make_runner(returncode=0, stderr="", raises=None):
    calls = []

    def _runner(cmd, **kwargs):
        calls.append(cmd)
        if raises is not None:
            raise raises
        return subprocess.CompletedProcess(
            args=cmd, returncode=returncode, stdout="", stderr=stderr)
    _runner.calls = calls
    return _runner


def touch_pdfs(dir_path, *names):
    dir_path.mkdir(parents=True, exist_ok=True)
    paths = []
    for name in names:
        p = dir_path / name
        p.write_bytes(b"%PDF-1.4 fake\n")
        paths.append(p)
    return paths


# --- WizardError ----------------------------------------------------------

def test_wizard_error_is_a_runtime_error():
    assert issubclass(setup_wizard.WizardError, RuntimeError)


# --- scan_pdfs --------------------------------------------------------------

def test_scan_pdfs_sorted_case_insensitive_nonrecursive(tmp_path):
    touch_pdfs(tmp_path, "b.PDF", "a.pdf")
    (tmp_path / "c.txt").write_text("not a pdf", encoding="utf-8")
    sub = tmp_path / "sub"
    touch_pdfs(sub, "d.pdf")  # must never be picked up (non-recursive)

    result = setup_wizard.scan_pdfs(tmp_path)

    assert [p.name for p in result] == ["a.pdf", "b.PDF"]


def test_scan_pdfs_missing_dir_returns_empty_list(tmp_path):
    assert setup_wizard.scan_pdfs(tmp_path / "does-not-exist") == []


def test_scan_pdfs_empty_dir_returns_empty_list(tmp_path):
    assert setup_wizard.scan_pdfs(tmp_path) == []


# --- probe_encryption ---------------------------------------------------

def test_probe_encryption_ok_on_returncode_zero(tmp_path):
    pdf = tmp_path / "a.pdf"
    runner = make_runner(returncode=0, stderr="")
    assert setup_wizard.probe_encryption(pdf, runner=runner) == "ok"


@pytest.mark.parametrize("stderr_text", [
    "Incorrect password\n",
    "Command Line Error: Incorrect password\n",
    "SOME BUILD: incorrect PASSWORD variant\n",
])
def test_probe_encryption_password_required_when_none_supplied(tmp_path, stderr_text):
    pdf = tmp_path / "a.pdf"
    runner = make_runner(returncode=1, stderr=stderr_text)
    assert setup_wizard.probe_encryption(pdf, password=None, runner=runner) == \
        "password_required"


@pytest.mark.parametrize("stderr_text", [
    "Incorrect password\n",
    "Command Line Error: Incorrect password\n",
])
def test_probe_encryption_bad_password_when_password_supplied(tmp_path, stderr_text):
    pdf = tmp_path / "a.pdf"
    runner = make_runner(returncode=1, stderr=stderr_text)
    assert setup_wizard.probe_encryption(pdf, password="wrong", runner=runner) == \
        "bad_password"


def test_probe_encryption_other_nonzero_is_error(tmp_path):
    pdf = tmp_path / "a.pdf"
    runner = make_runner(returncode=1, stderr="I/O Error: Couldn't open file\n")
    assert setup_wizard.probe_encryption(pdf, runner=runner) == "error"


def test_probe_encryption_missing_binary_is_error(tmp_path):
    pdf = tmp_path / "a.pdf"
    runner = make_runner(raises=FileNotFoundError())
    assert setup_wizard.probe_encryption(pdf, runner=runner) == "error"


def test_probe_encryption_timeout_is_error(tmp_path):
    pdf = tmp_path / "a.pdf"
    runner = make_runner(raises=subprocess.TimeoutExpired(cmd="pdftotext", timeout=30))
    assert setup_wizard.probe_encryption(pdf, runner=runner) == "error"


def test_probe_encryption_command_shape_no_password(tmp_path):
    pdf = tmp_path / "a.pdf"
    runner = make_runner(returncode=0)
    setup_wizard.probe_encryption(pdf, runner=runner)
    cmd = runner.calls[0]
    assert cmd[:3] == ["pdftotext", "-l", "1"]
    assert "-upw" not in cmd
    assert str(pdf) in cmd
    assert cmd[-1] == os.devnull


def test_probe_encryption_command_shape_with_password(tmp_path):
    pdf = tmp_path / "a.pdf"
    runner = make_runner(returncode=0)
    setup_wizard.probe_encryption(pdf, password="secret", runner=runner)
    cmd = runner.calls[0]
    assert "-upw" in cmd
    assert cmd[cmd.index("-upw") + 1] == "secret"


# --- detect_pack_encryption ----------------------------------------------

def test_detect_pack_encryption_all_unencrypted(tmp_path):
    pdfs = touch_pdfs(tmp_path, "a.pdf", "b.pdf")
    assert setup_wizard.detect_pack_encryption(
        pdfs, probe=lambda pdf, **_: "ok") == "unencrypted"


def test_detect_pack_encryption_all_encrypted(tmp_path):
    pdfs = touch_pdfs(tmp_path, "a.pdf", "b.pdf")
    assert setup_wizard.detect_pack_encryption(
        pdfs, probe=lambda pdf, **_: "password_required") == "encrypted"


def test_detect_pack_encryption_mixed_raises_naming_files(tmp_path):
    a, b = touch_pdfs(tmp_path, "a.pdf", "b.pdf")

    def probe(pdf, **_):
        return "ok" if pdf.name == "a.pdf" else "password_required"

    with pytest.raises(setup_wizard.WizardError) as exc:
        setup_wizard.detect_pack_encryption([a, b], probe=probe)
    msg = str(exc.value)
    assert "a.pdf" in msg and "b.pdf" in msg


def test_detect_pack_encryption_probe_error_raises_naming_file(tmp_path):
    a, b = touch_pdfs(tmp_path, "a.pdf", "b.pdf")

    def probe(pdf, **_):
        return "ok" if pdf.name == "a.pdf" else "error"

    with pytest.raises(setup_wizard.WizardError, match="b.pdf"):
        setup_wizard.detect_pack_encryption([a, b], probe=probe)


# --- prompt_book_plan -----------------------------------------------------

def test_prompt_book_plan_accept_default_order(tmp_path):
    pdfs = touch_pdfs(tmp_path, "Alpha.pdf", "Beta.pdf")
    input_fn = make_input(["a"])
    print_fn, _ = make_recorder()

    result = setup_wizard.prompt_book_plan(pdfs, input_fn=input_fn, print_fn=print_fn)

    assert result == [
        {"slug": "book1", "label": "Book 1", "filename": "Alpha.pdf"},
        {"slug": "book2", "label": "Book 2", "filename": "Beta.pdf"},
    ]


def test_prompt_book_plan_rename_slugifies_label(tmp_path):
    pdfs = touch_pdfs(tmp_path, "Alpha.pdf", "Beta.pdf")
    input_fn = make_input(["r 1 Physics Notes!", "a"])
    print_fn, _ = make_recorder()

    result = setup_wizard.prompt_book_plan(pdfs, input_fn=input_fn, print_fn=print_fn)

    assert result[0] == {
        "slug": "physicsnotes", "label": "Physics Notes!", "filename": "Alpha.pdf"}
    assert result[1] == {"slug": "book2", "label": "Book 2", "filename": "Beta.pdf"}


def test_prompt_book_plan_move_reorders_and_resluggifies_positionally(tmp_path):
    pdfs = touch_pdfs(tmp_path, "One.pdf", "Two.pdf", "Three.pdf")
    input_fn = make_input(["m 1 3", "a"])
    print_fn, _ = make_recorder()

    result = setup_wizard.prompt_book_plan(pdfs, input_fn=input_fn, print_fn=print_fn)

    # One.pdf (originally position 1, label "Book 1") moves to the end;
    # labels travel with their book, slugs are regenerated from the final
    # position since none of these books were renamed.
    assert [b["filename"] for b in result] == ["Two.pdf", "Three.pdf", "One.pdf"]
    assert [b["slug"] for b in result] == ["book1", "book2", "book3"]
    assert result[2]["label"] == "Book 1"


def test_prompt_book_plan_exclude_then_undo_restores_original_order(tmp_path):
    pdfs = touch_pdfs(tmp_path, "One.pdf", "Two.pdf", "Three.pdf")
    input_fn = make_input(["x 2", "u", "a"])
    print_fn, _ = make_recorder()

    result = setup_wizard.prompt_book_plan(pdfs, input_fn=input_fn, print_fn=print_fn)

    assert [b["filename"] for b in result] == ["One.pdf", "Two.pdf", "Three.pdf"]
    assert [b["slug"] for b in result] == ["book1", "book2", "book3"]


def test_prompt_book_plan_exclude_without_undo_drops_book(tmp_path):
    pdfs = touch_pdfs(tmp_path, "One.pdf", "Two.pdf", "Three.pdf")
    input_fn = make_input(["x 2", "a"])
    print_fn, _ = make_recorder()

    result = setup_wizard.prompt_book_plan(pdfs, input_fn=input_fn, print_fn=print_fn)

    assert [b["filename"] for b in result] == ["One.pdf", "Three.pdf"]
    assert [b["slug"] for b in result] == ["book1", "book2"]
    assert result[1]["label"] == "Book 3"  # label travels, slug is positional


def test_prompt_book_plan_undo_with_nothing_excluded_reprompts(tmp_path):
    pdfs = touch_pdfs(tmp_path, "One.pdf")
    input_fn = make_input(["u", "a"])
    print_fn, calls = make_recorder()

    result = setup_wizard.prompt_book_plan(pdfs, input_fn=input_fn, print_fn=print_fn)

    assert result == [{"slug": "book1", "label": "Book 1", "filename": "One.pdf"}]
    assert any("nothing to undo" in c.lower() for c in calls)


def test_prompt_book_plan_slug_collision_reprompts_until_fixed(tmp_path):
    pdfs = touch_pdfs(tmp_path, "One.pdf", "Two.pdf")
    input_fn = make_input(["r 1 Alpha", "r 2 Alpha", "a", "r 2 Beta", "a"])
    print_fn, calls = make_recorder()

    result = setup_wizard.prompt_book_plan(pdfs, input_fn=input_fn, print_fn=print_fn)

    assert result == [
        {"slug": "alpha", "label": "Alpha", "filename": "One.pdf"},
        {"slug": "beta", "label": "Beta", "filename": "Two.pdf"},
    ]
    assert any("cannot accept" in c.lower() for c in calls)


def test_prompt_book_plan_invalid_command_reprompts(tmp_path):
    pdfs = touch_pdfs(tmp_path, "One.pdf")
    input_fn = make_input(["bogus", "a"])
    print_fn, calls = make_recorder()

    result = setup_wizard.prompt_book_plan(pdfs, input_fn=input_fn, print_fn=print_fn)

    assert result == [{"slug": "book1", "label": "Book 1", "filename": "One.pdf"}]
    assert any("unrecognized command" in c.lower() for c in calls)


def test_prompt_book_plan_invalid_book_number_reprompts(tmp_path):
    pdfs = touch_pdfs(tmp_path, "One.pdf")
    input_fn = make_input(["r 99 Whatever", "a"])
    print_fn, calls = make_recorder()

    result = setup_wizard.prompt_book_plan(pdfs, input_fn=input_fn, print_fn=print_fn)

    assert result == [{"slug": "book1", "label": "Book 1", "filename": "One.pdf"}]
    assert any("invalid book number" in c.lower() for c in calls)


# --- _parse_index (regression: double-signed tokens must not crash) --------

@pytest.mark.parametrize("token", ["--5", "-3", "-", "--", "1.5", "abc", "", " "])
def test_parse_index_rejects_non_digit_tokens_without_crashing(token):
    # Previously: "--5".strip().lstrip("-").isdigit() is True (lstrip
    # strips every leading '-'), so this fell through to int("--5"),
    # which raises ValueError, uncaught, crashing the whole interactive
    # session. Every one of these tokens must now return None instead.
    assert setup_wizard._parse_index(token, count=10) is None


@pytest.mark.parametrize("command", ["x --5", "r --2 Foo", "m --1 2"])
def test_prompt_book_plan_double_signed_index_reprompts_without_crashing(
        tmp_path, command):
    pdfs = touch_pdfs(tmp_path, "One.pdf", "Two.pdf")
    input_fn = make_input([command, "a"])
    print_fn, calls = make_recorder()

    result = setup_wizard.prompt_book_plan(pdfs, input_fn=input_fn, print_fn=print_fn)

    assert result == [
        {"slug": "book1", "label": "Book 1", "filename": "One.pdf"},
        {"slug": "book2", "label": "Book 2", "filename": "Two.pdf"},
    ]
    assert any("invalid" in c.lower() for c in calls)


def test_prompt_book_plan_empty_plan_rejects_accept_until_restored(tmp_path):
    pdfs = touch_pdfs(tmp_path, "One.pdf")
    input_fn = make_input(["x 1", "a", "u", "a"])
    print_fn, calls = make_recorder()

    result = setup_wizard.prompt_book_plan(pdfs, input_fn=input_fn, print_fn=print_fn)

    assert result == [{"slug": "book1", "label": "Book 1", "filename": "One.pdf"}]
    assert any("at least one book is required" in c.lower() for c in calls)


# --- obtain_password -------------------------------------------------------

def test_obtain_password_succeeds_on_second_attempt(tmp_path):
    pdf = tmp_path / "a.pdf"
    getpass_fn = make_input(["wrongpw", "rightpw"])
    print_fn, calls = make_recorder()

    def probe(_pdf, password):
        return "ok" if password == "rightpw" else "bad_password"

    result = setup_wizard.obtain_password(
        pdf, getpass_fn=getpass_fn, probe=probe, print_fn=print_fn)

    assert result == "rightpw"
    assert any("did not work" in c.lower() for c in calls)
    assert not any("wrongpw" in c or "rightpw" in c for c in calls)


def test_obtain_password_exhausts_after_max_attempts_counting_empty_input(tmp_path):
    pdf = tmp_path / "a.pdf"
    getpass_fn = make_input(["", "wrong1", "wrong2"])
    print_fn, calls = make_recorder()
    probe_calls = []

    def probe(_pdf, password):
        probe_calls.append(password)
        return "bad_password"

    with pytest.raises(setup_wizard.WizardError) as exc:
        setup_wizard.obtain_password(
            pdf, getpass_fn=getpass_fn, probe=probe, print_fn=print_fn,
            max_attempts=3)

    assert "a.pdf" in str(exc.value)
    assert "3" in str(exc.value)
    # empty input consumed an attempt without calling probe at all
    assert probe_calls == ["wrong1", "wrong2"]
    assert any("password cannot be empty" in c.lower() for c in calls)
    assert not any("wrong1" in c or "wrong2" in c for c in calls)
    assert "wrong1" not in str(exc.value) and "wrong2" not in str(exc.value)


# --- write_pack -------------------------------------------------------------

BOOKS = [{"slug": "book1", "label": "Book 1", "filename": "One.pdf"}]


def test_write_pack_writes_course_yaml_no_password_file_when_unencrypted(tmp_path):
    home = tmp_path / "home"
    books_dir = tmp_path / "books"
    books_dir.mkdir()

    pack = setup_wizard.write_pack(
        home, "demo", "Demo Course", books_dir, BOOKS,
        encrypted=False, password=None)

    assert pack == home / "courses" / "demo"
    course = yaml.safe_load((pack / "course.yaml").read_text(encoding="utf-8"))
    assert course == {
        "name": "Demo Course",
        "books_dir": str(books_dir.resolve()),
        "encrypted": False,
        "books": BOOKS,
    }
    assert not (pack / ".corpus" / ".pdf_password").exists()


def test_write_pack_password_file_mode_0600(tmp_path):
    home = tmp_path / "home"
    books_dir = tmp_path / "books"
    books_dir.mkdir()

    pack = setup_wizard.write_pack(
        home, "demo", "Demo Course", books_dir, BOOKS,
        encrypted=True, password="s3cret")

    pw_path = pack / ".corpus" / ".pdf_password"
    st = pw_path.stat()
    assert stat.S_IMODE(st.st_mode) == 0o600
    assert pw_path.read_text(encoding="utf-8").strip() == "s3cret"


def test_write_pack_refuses_existing_pack_without_force(tmp_path):
    home = tmp_path / "home"
    books_dir = tmp_path / "books"
    books_dir.mkdir()
    pack = home / "courses" / "demo"
    pack.mkdir(parents=True)
    marker = pack / "untouched.txt"
    marker.write_text("keep me", encoding="utf-8")

    with pytest.raises(setup_wizard.WizardError, match="already exists"):
        setup_wizard.write_pack(
            home, "demo", "Demo Course", books_dir, BOOKS,
            encrypted=False, password=None)

    assert marker.is_file()
    assert marker.read_text(encoding="utf-8") == "keep me"


def test_write_pack_force_only_removes_target_pack_sibling_survives(tmp_path):
    home = tmp_path / "home"
    books_dir = tmp_path / "books"
    books_dir.mkdir()
    other_pack = home / "courses" / "other"
    other_pack.mkdir(parents=True)
    (other_pack / "course.yaml").write_text("name: Other\n", encoding="utf-8")
    demo_pack = home / "courses" / "demo"
    demo_pack.mkdir(parents=True)
    (demo_pack / "stale.txt").write_text("old", encoding="utf-8")

    pack = setup_wizard.write_pack(
        home, "demo", "Demo Course", books_dir, BOOKS,
        encrypted=False, password=None, force=True)

    assert pack == demo_pack
    assert not (demo_pack / "stale.txt").exists()
    assert (demo_pack / "course.yaml").is_file()
    # sibling pack completely untouched
    assert (other_pack / "course.yaml").read_text(encoding="utf-8") == "name: Other\n"


@pytest.mark.parametrize("bad_slug", ["", ".", "..", "a/b", "../etc"])
def test_write_pack_rejects_invalid_slug(tmp_path, bad_slug):
    home = tmp_path / "home"
    books_dir = tmp_path / "books"
    books_dir.mkdir()

    with pytest.raises(setup_wizard.WizardError):
        setup_wizard.write_pack(
            home, bad_slug, "Demo Course", books_dir, BOOKS,
            encrypted=False, password=None)

    assert not (home / "courses").exists() or list((home / "courses").iterdir()) == []


# --- choose_llm -------------------------------------------------------------

def test_choose_llm_default_claude_cli_when_detected(tmp_path):
    input_fn = make_input([""])
    print_fn, _ = make_recorder()

    result = setup_wizard.choose_llm(
        input_fn=input_fn, print_fn=print_fn, which=lambda name: "/usr/bin/claude")

    assert result == {"provider": "claude_cli"}


def test_choose_llm_empty_input_reprompts_when_claude_not_detected(tmp_path):
    input_fn = make_input(["", "claude_cli"])
    print_fn, calls = make_recorder()

    result = setup_wizard.choose_llm(
        input_fn=input_fn, print_fn=print_fn, which=lambda name: None)

    assert result == {"provider": "claude_cli"}
    assert any("no default available" in c.lower() for c in calls)


def test_choose_llm_anthropic_api_optional_model_and_key_reminder(tmp_path):
    idx = str(config.LLM_PROVIDERS.index("anthropic_api") + 1)
    input_fn = make_input([idx, "custom-model"])
    print_fn, calls = make_recorder()

    result = setup_wizard.choose_llm(
        input_fn=input_fn, print_fn=print_fn, which=lambda name: None)

    assert result == {"provider": "anthropic_api", "model": "custom-model"}
    assert any("ANTHROPIC_API_KEY" in c for c in calls)
    assert "api_key" not in result


def test_choose_llm_anthropic_api_blank_model_omits_key(tmp_path):
    idx = str(config.LLM_PROVIDERS.index("anthropic_api") + 1)
    input_fn = make_input([idx, ""])
    print_fn, _ = make_recorder()

    result = setup_wizard.choose_llm(
        input_fn=input_fn, print_fn=print_fn, which=lambda name: None)

    assert result == {"provider": "anthropic_api"}


def test_choose_llm_openai_compatible_requires_base_url_reprompt(tmp_path):
    idx = str(config.LLM_PROVIDERS.index("openai_compatible") + 1)
    input_fn = make_input([idx, "", "http://localhost:11434/v1", "llama3"])
    print_fn, calls = make_recorder()

    result = setup_wizard.choose_llm(
        input_fn=input_fn, print_fn=print_fn, which=lambda name: None)

    assert result == {
        "provider": "openai_compatible",
        "base_url": "http://localhost:11434/v1",
        "model": "llama3",
    }
    assert any("base url is required" in c.lower() for c in calls)
    assert any("CRAMDEX_LLM_API_KEY" in c for c in calls)
    assert "api_key" not in result


def test_choose_llm_skip_returns_none(tmp_path):
    input_fn = make_input(["s"])
    print_fn, _ = make_recorder()

    result = setup_wizard.choose_llm(
        input_fn=input_fn, print_fn=print_fn, which=lambda name: "/usr/bin/claude")

    assert result is None


def test_choose_llm_unrecognized_choice_reprompts(tmp_path):
    input_fn = make_input(["bogus", "s"])
    print_fn, calls = make_recorder()

    result = setup_wizard.choose_llm(
        input_fn=input_fn, print_fn=print_fn, which=lambda name: None)

    assert result is None
    assert any("unrecognized choice" in c.lower() for c in calls)


# --- prompt_course_name -----------------------------------------------------

def test_prompt_course_name_accepts_nonempty_immediately():
    input_fn = make_input(["Intro to Widgets"])
    print_fn, _ = make_recorder()

    assert setup_wizard.prompt_course_name(
        input_fn=input_fn, print_fn=print_fn) == "Intro to Widgets"


def test_prompt_course_name_reprompts_on_empty_and_whitespace():
    input_fn = make_input(["", "   ", "Real Name"])
    print_fn, calls = make_recorder()

    result = setup_wizard.prompt_course_name(input_fn=input_fn, print_fn=print_fn)

    assert result == "Real Name"
    assert sum("cannot be empty" in c.lower() for c in calls) == 2


# --- prompt_course_slug ------------------------------------------------------

def test_prompt_course_slug_blank_accepts_proposed_default(tmp_path):
    home = tmp_path / "home"
    input_fn = make_input([""])
    print_fn, _ = make_recorder()

    slug, force = setup_wizard.prompt_course_slug(
        "Intro to Widgets!", home, input_fn=input_fn, print_fn=print_fn)

    assert slug == "introtowidgets"
    assert force is False


def test_prompt_course_slug_fallback_when_name_has_no_alnum(tmp_path):
    home = tmp_path / "home"
    input_fn = make_input([""])
    print_fn, _ = make_recorder()

    slug, force = setup_wizard.prompt_course_slug(
        "!!!", home, input_fn=input_fn, print_fn=print_fn)

    assert slug == "course1"
    assert force is False


def test_prompt_course_slug_custom_valid_slug_accepted(tmp_path):
    home = tmp_path / "home"
    input_fn = make_input(["my-course"])
    print_fn, _ = make_recorder()

    slug, force = setup_wizard.prompt_course_slug(
        "Anything", home, input_fn=input_fn, print_fn=print_fn)

    assert slug == "my-course"
    assert force is False


def test_prompt_course_slug_invalid_edit_reprompts(tmp_path):
    home = tmp_path / "home"
    input_fn = make_input(["a/b", "..", "fine"])
    print_fn, calls = make_recorder()

    slug, force = setup_wizard.prompt_course_slug(
        "Anything", home, input_fn=input_fn, print_fn=print_fn)

    assert slug == "fine"
    assert force is False
    assert sum("invalid slug" in c.lower() for c in calls) == 2


def test_prompt_course_slug_rejects_spaces_though_is_simple_slug_would_allow(
        tmp_path):
    # config.is_simple_slug("my course") is True (it only checks for
    # path separators, "." and ".."; a space is not a path separator),
    # but the wizard's own message promises "letters/digits/dashes, no
    # spaces" -- this must actually be enforced, not just claimed.
    home = tmp_path / "home"
    assert config.is_simple_slug("my course") is True
    input_fn = make_input(["my course", "my-course"])
    print_fn, calls = make_recorder()

    slug, force = setup_wizard.prompt_course_slug(
        "Anything", home, input_fn=input_fn, print_fn=print_fn)

    assert slug == "my-course"
    assert force is False
    assert any("invalid slug" in c.lower() for c in calls)


def test_prompt_course_slug_lowercases_mixed_case_input(tmp_path):
    home = tmp_path / "home"
    input_fn = make_input(["MyCourse"])
    print_fn, _ = make_recorder()

    slug, force = setup_wizard.prompt_course_slug(
        "Anything", home, input_fn=input_fn, print_fn=print_fn)

    assert slug == "mycourse"
    assert force is False


def test_prompt_course_slug_existing_pack_confirm_overwrite(tmp_path):
    home = tmp_path / "home"
    (home / "courses" / "demo").mkdir(parents=True)
    input_fn = make_input(["demo", "y"])
    print_fn, _ = make_recorder()

    slug, force = setup_wizard.prompt_course_slug(
        "Demo Course", home, input_fn=input_fn, print_fn=print_fn)

    assert slug == "demo"
    assert force is True


def test_prompt_course_slug_existing_pack_decline_then_pick_new(tmp_path):
    home = tmp_path / "home"
    (home / "courses" / "demo").mkdir(parents=True)
    input_fn = make_input(["demo", "n", "demo2"])
    print_fn, calls = make_recorder()

    slug, force = setup_wizard.prompt_course_slug(
        "Demo Course", home, input_fn=input_fn, print_fn=print_fn)

    assert slug == "demo2"
    assert force is False
    assert any("choose a different slug" in c.lower() for c in calls)


# --- prompt_books_dir ---------------------------------------------------------

def test_prompt_books_dir_valid_dir_returns_immediately(tmp_path):
    books_dir = tmp_path / "books"
    pdfs = touch_pdfs(books_dir, "a.pdf")
    input_fn = make_input([str(books_dir)])
    print_fn, _ = make_recorder()

    result_dir, result_pdfs = setup_wizard.prompt_books_dir(
        input_fn=input_fn, print_fn=print_fn)

    assert result_dir == books_dir
    assert result_pdfs == pdfs


def test_prompt_books_dir_reprompts_on_empty_input(tmp_path):
    books_dir = tmp_path / "books"
    touch_pdfs(books_dir, "a.pdf")
    input_fn = make_input(["", str(books_dir)])
    print_fn, calls = make_recorder()

    setup_wizard.prompt_books_dir(input_fn=input_fn, print_fn=print_fn)

    assert any("required" in c.lower() for c in calls)


def test_prompt_books_dir_reprompts_on_missing_directory(tmp_path):
    books_dir = tmp_path / "books"
    touch_pdfs(books_dir, "a.pdf")
    missing = tmp_path / "does-not-exist"
    input_fn = make_input([str(missing), str(books_dir)])
    print_fn, calls = make_recorder()

    result_dir, _ = setup_wizard.prompt_books_dir(input_fn=input_fn, print_fn=print_fn)

    assert result_dir == books_dir
    assert any("not a directory" in c.lower() for c in calls)


def test_prompt_books_dir_reprompts_with_count_on_zero_pdfs(tmp_path):
    empty_dir = tmp_path / "empty"
    empty_dir.mkdir()
    books_dir = tmp_path / "books"
    touch_pdfs(books_dir, "a.pdf")
    input_fn = make_input([str(empty_dir), str(books_dir)])
    print_fn, calls = make_recorder()

    setup_wizard.prompt_books_dir(input_fn=input_fn, print_fn=print_fn)

    assert any("0 found" in c for c in calls)


# --- _run_interactive: encrypted-path password storage messaging -----------

def test_run_interactive_encrypted_path_announces_storage_never_prints_password(
        tmp_path, monkeypatch):
    home = tmp_path / "home"
    # config.set_active_course (called inside _run_interactive) resolves
    # the home directory via config.cramdex_home() -> the CRAMDEX_HOME
    # env var, independently of the `home` argument passed to
    # _run_interactive itself; both must point at the same directory.
    monkeypatch.setenv("CRAMDEX_HOME", str(home))
    books_dir = tmp_path / "books"
    touch_pdfs(books_dir, "Locked.pdf")

    def fake_probe(pdf, password=None, runner=None):
        if password is None:
            return "password_required"
        return "ok" if password == "s3cr3t" else "bad_password"

    input_fn = make_input([
        "Locked Course",  # course name
        "",                # accept proposed slug ("lockedcourse")
        str(books_dir),    # books folder
        "a",                # accept book plan
        "s",                # skip llm
    ])
    getpass_fn = make_input(["s3cr3t"])
    print_fn, calls = make_recorder()

    pack = setup_wizard._run_interactive(
        home, input_fn=input_fn, print_fn=print_fn, getpass_fn=getpass_fn,
        which=lambda name: None, probe=fake_probe)

    rel_path = "courses/lockedcourse/.corpus/.pdf_password"
    # (a) announced before the getpass prompt: validated-then-stored, 600,
    # and the CRAMDEX_PDF_PASSWORD alternative
    pre_prompt = [c for c in calls if "validated" in c.lower()]
    assert len(pre_prompt) == 1
    assert rel_path in pre_prompt[0]
    assert "600" in pre_prompt[0]
    assert "CRAMDEX_PDF_PASSWORD" in pre_prompt[0]
    # (b) confirmed after write_pack, naming the same relative path and
    # repeating the env alternative
    post_write = [c for c in calls if c.startswith("Password stored at")]
    assert len(post_write) == 1
    assert rel_path in post_write[0]
    assert "600" in post_write[0]
    assert "CRAMDEX_PDF_PASSWORD" in post_write[0]
    # the password value itself never appears anywhere in the transcript
    assert not any("s3cr3t" in c for c in calls)

    pw_file = pack / ".corpus" / ".pdf_password"
    assert pw_file.is_file()
    assert pw_file.read_text(encoding="utf-8").strip() == "s3cr3t"


def test_run_interactive_unencrypted_path_prints_neither_storage_message(
        tmp_path, monkeypatch):
    home = tmp_path / "home"
    monkeypatch.setenv("CRAMDEX_HOME", str(home))
    books_dir = tmp_path / "books"
    touch_pdfs(books_dir, "Open.pdf")

    input_fn = make_input(["Open Course", "", str(books_dir), "a", "s"])
    print_fn, calls = make_recorder()

    setup_wizard._run_interactive(
        home, input_fn=input_fn, print_fn=print_fn,
        which=lambda name: None, probe=lambda pdf, **_: "ok")

    assert not any("validated" in c.lower() for c in calls)
    assert not any(c.startswith("Password stored at") for c in calls)


# --- _write_llm_block ---------------------------------------------------------

def test_write_llm_block_creates_config_when_missing(tmp_path):
    home = tmp_path / "home"
    home.mkdir()

    setup_wizard._write_llm_block(home, {"provider": "claude_cli"})

    data = yaml.safe_load((home / "config.yaml").read_text(encoding="utf-8"))
    assert data == {"llm": {"provider": "claude_cli"}}


def test_write_llm_block_preserves_other_existing_keys(tmp_path):
    home = tmp_path / "home"
    home.mkdir()
    (home / "config.yaml").write_text(
        yaml.safe_dump({"active_course": "demo", "some_other_key": "keep-me"}),
        encoding="utf-8")

    setup_wizard._write_llm_block(
        home, {"provider": "anthropic_api", "model": "custom-model"})

    data = yaml.safe_load((home / "config.yaml").read_text(encoding="utf-8"))
    assert data == {
        "active_course": "demo",
        "some_other_key": "keep-me",
        "llm": {"provider": "anthropic_api", "model": "custom-model"},
    }


def test_write_llm_block_overwrites_previous_llm_block(tmp_path):
    home = tmp_path / "home"
    home.mkdir()
    (home / "config.yaml").write_text(
        yaml.safe_dump({"llm": {"provider": "openai_compatible",
                                 "base_url": "http://old"}}),
        encoding="utf-8")

    setup_wizard._write_llm_block(home, {"provider": "claude_cli"})

    data = yaml.safe_load((home / "config.yaml").read_text(encoding="utf-8"))
    assert data == {"llm": {"provider": "claude_cli"}}


# --- _stream_subprocess -------------------------------------------------------

def test_stream_subprocess_streams_lines_and_returns_exit_code(tmp_path):
    print_fn, calls = make_recorder()
    script = (
        "import sys\n"
        "print('line1')\n"
        "print('line2', file=sys.stderr)\n"
        "sys.exit(3)\n"
    )

    code = setup_wizard._stream_subprocess(
        # -u: unbuffered stdout, so its interleaving with stderr against
        # the same combined pipe is deterministic instead of racing
        # Python's default stdout block-buffering-when-piped behavior.
        [sys.executable, "-u", "-c", script], cwd=tmp_path, print_fn=print_fn)

    assert code == 3
    assert calls == ["line1", "line2"]


# --- build_arg_parser ---------------------------------------------------------

def test_build_arg_parser_defaults_all_false():
    args = setup_wizard.build_arg_parser().parse_args([])
    assert (args.demo, args.force, args.rebuild_web) == (False, False, False)


def test_build_arg_parser_flags_parse():
    args = setup_wizard.build_arg_parser().parse_args(
        ["--demo", "--force", "--rebuild-web"])
    assert (args.demo, args.force, args.rebuild_web) == (True, True, True)


# --- _shared_tail -------------------------------------------------------------

def make_stream_recorder(returncodes):
    """Fake run_stream returning canned exit codes in call order (extras
    left unconsumed are fine: not every test scenario invokes npm install
    before npm run build). Records every cmd list for the test to assert
    against."""
    calls = []
    codes = iter(returncodes)

    def _run(cmd, cwd, print_fn=print):
        calls.append(list(cmd))
        try:
            return next(codes)
        except StopIteration:
            raise AssertionError(f"run_stream exhausted; extra call: {cmd}")
    _run.calls = calls
    return _run


def test_shared_tail_corpus_failure_returns_2_and_never_reaches_web(tmp_path):
    run_stream = make_stream_recorder([1])
    print_fn, calls = make_recorder()
    pack = tmp_path / "home" / "courses" / "demo"

    code = setup_wizard._shared_tail(
        pack, rebuild_web=True, print_fn=print_fn, run_stream=run_stream)

    assert code == 2
    # only the corpus-build call happened: the web step is never reached
    assert len(run_stream.calls) == 1
    assert run_stream.calls[0][0] == "bash"
    assert any("corpus build failed" in c.lower() for c in calls)


def test_shared_tail_web_build_failure_returns_3(tmp_path):
    # corpus build (bash ...) succeeds; any npm-family call (install or
    # build, whichever runs first depends on this checkout's real
    # app/web/node_modules state) fails. "dist missing" is simulated via
    # rebuild_web=True rather than touching the real app/web/dist.
    def run_stream(cmd, cwd, print_fn=print):
        return 0 if cmd[0] == "bash" else 7

    print_fn, calls = make_recorder()
    pack = tmp_path / "home" / "courses" / "demo"

    code = setup_wizard._shared_tail(
        pack, rebuild_web=True, print_fn=print_fn, run_stream=run_stream)

    assert code == 3
    assert any("failed (exit 7)" in c.lower() for c in calls)


def test_shared_tail_success_returns_0_and_prints_summary(tmp_path):
    run_stream = make_stream_recorder([0, 0, 0])
    print_fn, calls = make_recorder()
    pack = tmp_path / "home" / "courses" / "demo"

    code = setup_wizard._shared_tail(
        pack, rebuild_web=True, print_fn=print_fn, run_stream=run_stream)

    assert code == 0
    assert any("setup complete" in c.lower() for c in calls)
    assert any("bash app/run.sh" in c for c in calls)
    # corpus build always ran; the exact web call count depends on
    # whether this checkout's app/web/node_modules already exists
    assert run_stream.calls[0][0] == "bash"


# --- main(): EOFError routing --------------------------------------------------

def test_main_eof_at_first_prompt_returns_1_with_demo_pointer(tmp_path, monkeypatch):
    monkeypatch.setenv("CRAMDEX_HOME", str(tmp_path / "home"))

    def eof_input(prompt=""):
        raise EOFError()

    print_fn, calls = make_recorder()

    code = setup_wizard.main([], input_fn=eof_input, print_fn=print_fn)

    assert code == 1
    assert any("stdin closed" in c.lower() for c in calls)
    assert any("--demo" in c for c in calls)


def test_main_eof_mid_flow_still_routes_through_demo_pointer(tmp_path, monkeypatch):
    # EOF a few prompts in (after the course name and slug are answered,
    # at the books-folder prompt) still hits the same guard: the guard is
    # not special-cased to only the very first prompt, it is main()'s
    # single try/except around the whole interactive call. Unlike
    # make_input (which raises AssertionError on exhaustion, to catch a
    # test under-provisioning its own scripted responses), this fake
    # raises the real EOFError once its scripted lines run out, so it can
    # simulate stdin actually closing partway through the flow.
    lines = iter(["My Course", ""])

    def input_fn(prompt=""):
        try:
            return next(lines)
        except StopIteration:
            raise EOFError()

    monkeypatch.setenv("CRAMDEX_HOME", str(tmp_path / "home"))
    print_fn, calls = make_recorder()

    code = setup_wizard.main([], input_fn=input_fn, print_fn=print_fn)

    assert code == 1
    assert any("stdin closed" in c.lower() for c in calls)
    assert any("--demo" in c for c in calls)


# --- main(): --demo dispatch --------------------------------------------------

def test_main_demo_dispatch_calls_build_demo_pack_then_shared_tail(
        tmp_path, monkeypatch):
    home = tmp_path / "home"
    monkeypatch.setenv("CRAMDEX_HOME", str(home))

    call_order = []

    def fake_build_demo_pack(home_arg, force=False):
        call_order.append(("build_demo_pack", home_arg, force))
        return home_arg / "courses" / "demo"

    def fake_shared_tail(pack, rebuild_web, *, print_fn=print, run_stream=None):
        call_order.append(("shared_tail", pack, rebuild_web))
        return 42

    monkeypatch.setattr("make_demo_pack.build_demo_pack", fake_build_demo_pack)
    monkeypatch.setattr(setup_wizard, "_shared_tail", fake_shared_tail)

    code = setup_wizard.main(["--demo", "--force"])

    assert code == 42
    assert [c[0] for c in call_order] == ["build_demo_pack", "shared_tail"]
    assert call_order[0][1] == home
    assert call_order[0][2] is True  # --force passed through
    assert call_order[1][1] == home / "courses" / "demo"
    assert call_order[1][2] is False  # --rebuild-web not passed


def test_main_demo_dispatch_passes_rebuild_web_through(tmp_path, monkeypatch):
    home = tmp_path / "home"
    monkeypatch.setenv("CRAMDEX_HOME", str(home))

    seen = {}

    def fake_build_demo_pack(home_arg, force=False):
        return home_arg / "courses" / "demo"

    def fake_shared_tail(pack, rebuild_web, *, print_fn=print, run_stream=None):
        seen["rebuild_web"] = rebuild_web
        return 0

    monkeypatch.setattr("make_demo_pack.build_demo_pack", fake_build_demo_pack)
    monkeypatch.setattr(setup_wizard, "_shared_tail", fake_shared_tail)

    code = setup_wizard.main(["--demo", "--force", "--rebuild-web"])

    assert code == 0
    assert seen["rebuild_web"] is True
