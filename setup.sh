#!/usr/bin/env bash
#
# setup.sh: guided cramdex bootstrap.
#
# Detects the OS, checks (with actionable per-OS hints) for the tools the
# wizard and backend need, creates/updates app/server/.venv, then execs the
# interactive Python wizard (scripts/setup_wizard.py), which builds the
# course pack, corpus, and frontend.
#
# Usage:
#   bash setup.sh              interactive course setup
#   bash setup.sh --demo       non-interactive fictional demo course
#   bash setup.sh --demo --force
#   bash setup.sh --rebuild-web
#
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$REPO_ROOT"

# --- OS detection ------------------------------------------------------------

OS_NAME="$(uname -s)"
case "$OS_NAME" in
  Darwin)
    OS_LABEL="macOS"
    ;;
  Linux)
    OS_LABEL="Linux"
    ;;
  *)
    echo "ERROR: unsupported platform ($OS_NAME)." >&2
    echo "" >&2
    echo "cramdex's setup.sh targets macOS and Linux, including Windows" >&2
    echo "Subsystem for Linux (WSL2). On Windows:" >&2
    echo "  1. Install WSL2: https://learn.microsoft.com/windows/wsl/install" >&2
    echo "  2. Open a WSL Ubuntu shell (not PowerShell or Git Bash)" >&2
    echo "  3. Clone this repo inside the WSL filesystem (not /mnt/c/...)" >&2
    echo "  4. Re-run: bash setup.sh" >&2
    exit 1
    ;;
esac

echo "== cramdex setup: $OS_LABEL =="
echo ""

pkg_hint() {
  # pkg_hint <brew-package-or-instructions> <apt-package-or-instructions>
  if [[ "$OS_NAME" == "Darwin" ]]; then
    echo "  Install with: brew install $1"
  else
    echo "  Install with: sudo apt install $2"
  fi
}

# --- uv (Python installer/venv manager); soft dependency ----------------------

USE_UV=1
echo "-- uv --"
if command -v uv >/dev/null 2>&1; then
  echo "   found: $(uv --version)"
else
  USE_UV=0
  echo "   not found; falling back to 'python3 -m venv' (slower, but works)."
  echo "   Optional, faster path:"
  # uv has no apt package, so this bypasses pkg_hint's "sudo apt install
  # $2" template (which previously rendered the nonsensical "sudo apt
  # install (no apt package; run: curl ...)" on Linux) and prints the
  # curl installer directly there instead.
  if [[ "$OS_NAME" == "Darwin" ]]; then
    echo "  Install with: brew install uv"
  else
    echo "  Install with: curl -LsSf https://astral.sh/uv/install.sh | sh"
  fi
fi

# --- Python 3.12 ----------------------------------------------------------------

echo ""
echo "-- Python 3.12 --"
if [[ "$USE_UV" -eq 1 ]]; then
  if uv python find 3.12 >/dev/null 2>&1; then
    echo "   found via uv: $(uv python find 3.12)"
  else
    echo "   not found locally; letting uv fetch it (uv python install 3.12)..."
    if ! uv python install 3.12; then
      echo "ERROR: uv could not obtain Python 3.12." >&2
      echo "  Try manually: uv python install 3.12" >&2
      exit 1
    fi
  fi
else
  if ! command -v python3 >/dev/null 2>&1; then
    echo "ERROR: python3 not found." >&2
    pkg_hint python@3.12 python3.12-venv
    exit 1
  fi
  if ! python3 -c 'import sys; raise SystemExit(0 if sys.version_info[:2] >= (3, 12) else 1)'; then
    echo "ERROR: python3 is $(python3 -V 2>&1), need 3.12 or newer." >&2
    pkg_hint python@3.12 python3.12-venv
    exit 1
  fi
  echo "   found: $(python3 -V 2>&1)"
fi

# --- node >= 18 -------------------------------------------------------------------

echo ""
echo "-- node (>= 18) --"
if ! command -v node >/dev/null 2>&1; then
  echo "ERROR: node not found." >&2
  pkg_hint node nodejs
  exit 1
fi
if ! NODE_VERSION="$(node --version 2>/dev/null)"; then
  echo "ERROR: node is on PATH but 'node --version' failed. Repair your" >&2
  echo "Node installation (stale nvm/fnm shim?)." >&2
  pkg_hint node nodejs
  exit 1
fi
NODE_MAJOR="${NODE_VERSION#v}"           # NODE_VERSION e.g. v26.0.0
NODE_MAJOR="${NODE_MAJOR%%.*}"
if [[ "$NODE_MAJOR" -lt 18 ]]; then
  echo "ERROR: node is $NODE_VERSION, need >= 18." >&2
  pkg_hint node nodejs
  exit 1
fi
echo "   found: node $NODE_VERSION"

# --- npm -----------------------------------------------------------------------------

echo ""
echo "-- npm --"
if ! command -v npm >/dev/null 2>&1; then
  echo "ERROR: npm not found (normally bundled with Node.js)." >&2
  pkg_hint node nodejs
  exit 1
fi
echo "   found: npm $(npm --version)"

# --- pdftotext (poppler) ---------------------------------------------------------------

echo ""
echo "-- pdftotext (poppler) --"
if ! command -v pdftotext >/dev/null 2>&1; then
  echo "ERROR: pdftotext not found." >&2
  pkg_hint poppler poppler-utils
  exit 1
fi
echo "   found: $(pdftotext -v 2>&1 | head -1)"

# --- backend virtualenv ----------------------------------------------------------------

echo ""
echo "-- Backend virtualenv --"
VENV_DIR="$REPO_ROOT/app/server/.venv"
VENV_PY="$VENV_DIR/bin/python"
REQS="$REPO_ROOT/app/server/requirements.txt"

NEED_INSTALL=0
if [[ ! -x "$VENV_PY" ]]; then
  echo "   creating $VENV_DIR ..."
  if [[ "$USE_UV" -eq 1 ]]; then
    uv venv --python 3.12 "$VENV_DIR"
  else
    python3 -m venv "$VENV_DIR"
  fi
  NEED_INSTALL=1
elif ! "$VENV_PY" -c "import fastapi, uvicorn, yaml, anthropic, httpx" >/dev/null 2>&1; then
  echo "   existing venv is missing required packages; reinstalling..."
  NEED_INSTALL=1
else
  echo "   existing venv looks complete; skipping install."
fi

if [[ "$NEED_INSTALL" -eq 1 ]]; then
  echo "   installing backend requirements..."
  if [[ "$USE_UV" -eq 1 ]]; then
    uv pip install -r "$REQS" --python "$VENV_PY"
  else
    "$VENV_PY" -m pip install --upgrade pip
    "$VENV_PY" -m pip install -r "$REQS"
  fi
fi

# --- hand off to the interactive Python wizard --------------------------------------------

echo ""
exec "$VENV_PY" "$REPO_ROOT/scripts/setup_wizard.py" "$@"
