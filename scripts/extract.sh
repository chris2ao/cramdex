#!/usr/bin/env bash
#
# extract.sh: extract text from the active course pack's book PDFs into the
# pack's corpus. Output is plain text with page breaks preserved (form-feed
# \f), one text file per book under <pack>/.corpus/text/.
#
# Source PDFs are the user's own copyrighted courseware and live outside the
# repo. Extracted text stays in the pack's .corpus/ and is never committed.
#
# Usage:
#   scripts/extract.sh
#   CRAMDEX_BOOKS_DIR="/path/to/pdfs" scripts/extract.sh
#
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PY="$REPO_ROOT/app/server/.venv/bin/python"
[[ -x "$PY" ]] || PY="python3"

PACK_DIR="$("$PY" "$REPO_ROOT/scripts/pack_manifest.py" dir)"
BOOKS_DIR="$("$PY" "$REPO_ROOT/scripts/pack_manifest.py" books-dir)"
BOOKS_TSV="$("$PY" "$REPO_ROOT/scripts/pack_manifest.py" books)"
OUT_DIR="$PACK_DIR/.corpus/text"
MANIFEST="$PACK_DIR/.corpus/manifest.tsv"

if ! command -v pdftotext >/dev/null 2>&1; then
  echo "ERROR: pdftotext not found. Install poppler (brew install poppler / apt install poppler-utils)" >&2
  exit 1
fi

if [[ ! -d "$BOOKS_DIR" ]]; then
  echo "ERROR: books folder not found: $BOOKS_DIR" >&2
  exit 1
fi

# Encrypted PDFs need the document-open password. Provide it via (checked in
# order) CRAMDEX_PDF_PASSWORD or <pack>/.corpus/.pdf_password so it never
# lands in git or the shell transcript. Unencrypted PDFs need neither.
PDF_PASSWORD="${CRAMDEX_PDF_PASSWORD:-}"
PW_FILE="$PACK_DIR/.corpus/.pdf_password"
if [[ -z "$PDF_PASSWORD" && -f "$PW_FILE" ]]; then
  PDF_PASSWORD="$(head -n1 "$PW_FILE")"
fi

PW_ARGS=()
if [[ -n "$PDF_PASSWORD" ]]; then
  PW_ARGS=(-upw "$PDF_PASSWORD")
fi

mkdir -p "$OUT_DIR"
printf 'slug\tlabel\tsource_filename\tpdf_pages\toffset\n' > "$MANIFEST"

echo "Extracting from: $BOOKS_DIR"
echo "Output to:       $OUT_DIR"
echo ""

while IFS=$'\t' read -r slug label fname; do
  src="$BOOKS_DIR/$fname"
  out="$OUT_DIR/$slug.txt"

  if [[ ! -f "$src" ]]; then
    echo "  SKIP  $label: source not found: $fname" >&2
    continue
  fi

  if ! pdftotext ${PW_ARGS[@]+"${PW_ARGS[@]}"} -layout -enc UTF-8 "$src" "$out"; then
    echo "  FAIL  $label: pdftotext failed (wrong password?)" >&2
    continue
  fi

  # Count pages via the same split_pages() helper build_index_db.py,
  # calibrate_offsets.py, and extract_terms.py use, so every stage agrees on
  # the page count regardless of whether this poppler build emits a
  # trailing form feed after the last page (poppler 26.07's pdftotext does;
  # not every build does).
  pages=$("$PY" -c '
import sys
sys.path.insert(0, sys.argv[1] + "/scripts")
from pack_manifest import split_pages
with open(sys.argv[2], encoding="utf-8", errors="replace") as f:
    print(len(split_pages(f.read())))
' "$REPO_ROOT" "$out")

  printf '%s\t%s\t%s\t%s\t0\n' "$slug" "$label" "$fname" "$pages" >> "$MANIFEST"
  echo "  OK    $label: $pages pages -> $slug.txt"
done <<< "$BOOKS_TSV"

echo ""
echo "Manifest: $MANIFEST"
echo "Done."
