#!/usr/bin/env bash
#
# build.sh: rebuild the entire course corpus and search index.
#
# Runs: extract book PDFs -> text  (extract.sh)
#   then: text -> SQLite FTS5 index (build_index_db.py)
#
# Safe to re-run any time the source PDFs or the page-offset calibration
# change. All output lands in .corpus/ (gitignored, copyrighted, local-only).
#
# Usage:
#   scripts/build.sh
#   CRAMDEX_BOOKS_DIR="/path/to/pdfs" scripts/build.sh
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PY="$SCRIPT_DIR/../app/server/.venv/bin/python"
[[ -x "$PY" ]] || PY=python3

# Ensure Homebrew tools (pdftotext) are on PATH for non-login shells.
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"

echo "== 1/4 Extracting text from PDFs =="
bash "$SCRIPT_DIR/extract.sh"

echo ""
echo "== 2/4 Calibrating printed-page offsets =="
"$PY" "$SCRIPT_DIR/calibrate_offsets.py"

echo ""
echo "== 3/4 Building SQLite FTS5 index =="
"$PY" "$SCRIPT_DIR/build_index_db.py"

echo ""
echo "== 4/4 Extracting index term suggestions =="
"$PY" "$SCRIPT_DIR/extract_terms.py"

echo ""
echo "Corpus ready. Try:  $PY scripts/search.py \"your term\""
