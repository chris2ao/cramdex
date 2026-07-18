#!/usr/bin/env python3
"""
search.py: query the course corpus full-text index.

Ranked (BM25) search over all course books with exact book + page citations.
This is how Claude (and you) find relevant material to answer questions or to
build the open-book exam index.

Examples:
    python3 scripts/search.py "ops tempo"
    python3 scripts/search.py "DEMO-CYCLE" --book book1 --limit 5
    python3 scripts/search.py "worst case analysis" --context   # print full page text
    python3 scripts/search.py '=containment OR eradication' --raw # raw FTS5 expression

By default the query is treated as an exact phrase (best for looking up a term
for the index). Use --or to match any token, or --raw to pass a raw FTS5 MATCH
expression.

Exit code 0 with results, 1 if none found.
"""

import argparse
import os
import re
import sqlite3
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from pack_manifest import pack_dir

DB_PATH = os.path.join(str(pack_dir()), ".corpus", "corpus.db")


def build_match(query, mode):
    """Turn a user query into a safe FTS5 MATCH expression."""
    if mode == "raw":
        return query
    tokens = re.findall(r"[A-Za-z0-9]+", query)
    if not tokens:
        # Fall back to a quoted phrase of the raw text.
        return '"' + query.replace('"', "") + '"'
    if mode == "or":
        return " OR ".join(tokens)
    # phrase (default): exact ordered phrase
    return '"' + " ".join(tokens) + '"'


def page_ref(row):
    """Human-readable citation, e.g. 'Book 3 p.47' (with pdf page if it differs)."""
    label, pdf_page, printed = row["label"], row["pdf_page"], row["printed_page"]
    if printed is not None and printed != pdf_page and printed > 0:
        return f"{label} p.{printed} (pdf {pdf_page})"
    return f"{label} p.{pdf_page}"


def main():
    ap = argparse.ArgumentParser(description="Search the course corpus.")
    ap.add_argument("query", help="search terms")
    ap.add_argument("--book", help="restrict to one book slug (e.g. book1, workbook)")
    ap.add_argument("--limit", type=int, default=10, help="max results (default 10)")
    ap.add_argument("--context", action="store_true", help="print full page text of each hit")
    group = ap.add_mutually_exclusive_group()
    group.add_argument("--or", dest="or_mode", action="store_true", help="match ANY token")
    group.add_argument("--raw", action="store_true", help="query is a raw FTS5 expression")
    args = ap.parse_args()

    if not os.path.isfile(DB_PATH):
        sys.exit(f"ERROR: index not found: {DB_PATH}\nRun scripts/build.sh first.")

    mode = "raw" if args.raw else "or" if args.or_mode else "phrase"
    match = build_match(args.query, mode)

    con = sqlite3.connect(DB_PATH)
    con.row_factory = sqlite3.Row
    cur = con.cursor()

    where = "pages MATCH ?"
    params = [match]
    if args.book:
        where += " AND slug = ?"
        params.append(args.book)
    params.append(args.limit)

    sql = f"""
        SELECT slug, label, pdf_page, printed_page,
               snippet(pages, 4, '[[', ']]', ' … ', 16) AS snip,
               text,
               bm25(pages) AS score
        FROM pages
        WHERE {where}
        ORDER BY score
        LIMIT ?
    """
    try:
        rows = cur.execute(sql, params).fetchall()
    except sqlite3.OperationalError as e:
        con.close()
        sys.exit(f"ERROR: bad query ({match!r}): {e}")

    if not rows:
        print(f"No results for {args.query!r} (mode={mode}, match={match!r}).")
        con.close()
        sys.exit(1)

    print(f"{len(rows)} result(s) for {args.query!r} (mode={mode}):\n")
    for i, row in enumerate(rows, start=1):
        print(f"{i}. {page_ref(row)}")
        if args.context:
            print("-" * 70)
            print(row["text"].strip())
            print("-" * 70)
        else:
            snip = " ".join(row["snip"].split())
            print(f"   {snip}")
        print()

    con.close()


if __name__ == "__main__":
    main()
