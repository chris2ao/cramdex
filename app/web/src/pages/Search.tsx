import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { get } from "../api";
import { CitationChip } from "../components/CitationChip";
import { Panel } from "../components/ui/Panel";
import { ButtonPrimary } from "../components/ui/Button";
import { Eyebrow } from "../components/ui/Text";
import { Pill } from "../components/ui/Pill";
import { useStore } from "../stores/useStore";
import { bookmarksStore, addBookmark, removeBookmark, isBookmarked } from "../stores/bookmarks";
import { AddToIndexButton } from "../components/IndexCapture";

type Hit = { slug: string; label: string; pdf_page: number;
             printed_page: number; snippet: string; score: number };

const BOOKS: Array<{ slug: string; label: string }> = [
  { slug: "", label: "ALL" },
  { slug: "book1", label: "BK1" },
  { slug: "book2", label: "BK2" },
  { slug: "book3", label: "BK3" },
  { slug: "book4", label: "BK4" },
  { slug: "book5", label: "BK5" },
  { slug: "bookB", label: "BKB" },
  { slug: "workbook", label: "WKBK" },
];

/** Strips the [[..]] match markers and trims for a bookmark note. */
function plainSnippet(text: string): string {
  const plain = text.replace(/\[\[|\]\]/g, "");
  return plain.length > 140 ? `${plain.slice(0, 140).trimEnd()}…` : plain;
}

/** Renders a snippet's [[match]] markers as highlighted <mark> spans. */
function renderSnippet(text: string) {
  const parts = text.split(/\[\[(.+?)\]\]/g);
  return parts.map((p, i) =>
    i % 2 === 1
      ? <mark key={i} className="bg-yl text-black">{p}</mark>
      : <span key={i}>{p}</span>
  );
}

function SaveButton({ hit }: { hit: Hit }) {
  const bookmarks = useStore(bookmarksStore);
  const saved = isBookmarked(bookmarks, hit.slug, hit.printed_page);
  return (
    <button
      onClick={() => saved
        ? removeBookmark(`${hit.slug}:${hit.printed_page}`)
        : addBookmark({ slug: hit.slug, label: hit.label, page: hit.printed_page,
                        note: plainSnippet(hit.snippet) })}
      className={`mono-label text-[10px] transition-colors duration-120 ${
        saved ? "text-yl" : "text-faint hover:text-yl"}`}
    >
      {saved ? "[SAVED]" : "[+SAVE]"}
    </button>
  );
}

function ResultCard({ hit }: { hit: Hit }) {
  return (
    <Panel className="border-l-2 border-l-cy p-4 transition-colors duration-120 hover:border-cy">
      <div className="mb-2 flex items-center justify-between gap-2">
        <CitationChip label={hit.label} slug={hit.slug} page={hit.printed_page}
                      text={`${hit.label} p.${hit.printed_page}`} />
        <div className="flex items-center gap-3">
          <span className="mono-label text-[10px] text-faint">
            REL: {Math.abs(hit.score).toFixed(1)}
          </span>
          <SaveButton hit={hit} />
          <AddToIndexButton slug={hit.slug} label={hit.label} page={hit.printed_page}
                            snippet={plainSnippet(hit.snippet)} />
        </div>
      </div>
      <p className="text-base font-medium text-muted">{renderSnippet(hit.snippet)}</p>
    </Panel>
  );
}

export function Search() {
  const [params] = useSearchParams();
  const [q, setQ] = useState(params.get("q") ?? "");
  const [lastQuery, setLastQuery] = useState("");
  const [elapsed, setElapsed] = useState<number | null>(null);
  const [book, setBook] = useState("");
  const [mode, setMode] = useState<"phrase" | "or">("phrase");
  const [hits, setHits] = useState<Hit[] | null>(null);
  const [error, setError] = useState("");
  const seqRef = useRef(0);

  useEffect(() => {
    if (params.get("q")) run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function run() {
    if (!q.trim()) return;
    const seq = ++seqRef.current;
    const searchedQuery = q;
    const started = performance.now();
    setError("");
    try {
      const query = new URLSearchParams({ q, mode, limit: "25" });
      if (book) query.set("book", book);
      const body = await get<{ results: Hit[] }>(`/api/search?${query}`);
      if (seq !== seqRef.current) return;
      setHits(body.results);
      setLastQuery(searchedQuery);
      setElapsed((performance.now() - started) / 1000);
    } catch (e) {
      if (seq !== seqRef.current) return;
      setError((e as Error).message);
      setHits(null);
    }
  }

  return (
    <div>
      <Eyebrow className="mb-2">DATABASE_QUERY</Eyebrow>
      <h1 className="mb-6 text-[30px] font-bold uppercase tracking-wide text-fg">
        Search the corpus
      </h1>

      <div className="mb-4 flex gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && run()}
          placeholder="TYPE QUERY // ENTER TO EXECUTE"
          aria-label="Search the corpus"
          className="input-hud flex-1 px-4 py-2.5 text-sm"
        />
        <ButtonPrimary onClick={run}>EXECUTE</ButtonPrimary>
      </div>

      <div className="mb-4 flex flex-wrap gap-2" role="group" aria-label="Filter by book">
        {BOOKS.map((b) => (
          <Pill key={b.slug || "all"} active={book === b.slug} onClick={() => setBook(b.slug)}>
            {b.label}
          </Pill>
        ))}
        <Pill
          active={mode === "or"}
          color="yl"
          onClick={() => setMode(mode === "phrase" ? "or" : "phrase")}
          title="phrase: exact order; any: match any word"
        >
          {mode === "phrase" ? "EXACT PHRASE" : "ANY WORD"}
        </Pill>
      </div>

      {error && <p className="mb-4 text-sm text-rd">{error}</p>}

      {hits !== null && (
        <p className="mb-4 font-mono text-xs text-faint">
          {`> ${hits.length} HITS RETURNED · ${elapsed?.toFixed(2)}s · QUERY: "${lastQuery.toUpperCase()}"`}
        </p>
      )}

      {hits?.length === 0 && (
        <Panel className="p-4">
          <span className="mono-label text-xs text-faint">// NO RESULTS FOUND</span>
        </Panel>
      )}

      <ul className="space-y-3">
        {hits?.map((h, i) => (
          <li key={i}>
            <ResultCard hit={h} />
          </li>
        ))}
      </ul>
    </div>
  );
}
