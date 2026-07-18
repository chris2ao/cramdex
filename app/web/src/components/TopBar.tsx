import { Link } from "react-router-dom";
import { useFetch } from "../hooks/useFetch";
import { useStore } from "../stores/useStore";
import { bookmarksStore } from "../stores/bookmarks";

export const OPEN_PALETTE_EVENT = "open-command-palette";

function CorpusStatus() {
  const { data, error } = useFetch<{ ok: boolean }>("/api/health");
  const online = !error && data?.ok === true;
  const color = online ? "text-gn" : "text-rd";
  return (
    <span className={`flex items-center gap-1.5 font-mono text-[11px] uppercase
                      tracking-[0.08em] ${color}`}>
      <span aria-hidden className="pulse-hud">●</span>
      {online ? "CORPUS::ONLINE" : "CORPUS::OFFLINE"}
    </span>
  );
}

export function TopBar() {
  const bookmarks = useStore(bookmarksStore);
  return (
    <header className="sticky top-0 z-40 border-b border-edge px-8 py-3
                       backdrop-blur-[8px] print:hidden"
            style={{ background: "rgba(10,12,16,0.9)" }}>
      <div className="flex items-center gap-[18px]">
        <button
          onClick={() => window.dispatchEvent(new Event(OPEN_PALETTE_EVENT))}
          aria-label="Search all books"
          className="input-hud flex w-full max-w-[540px] items-center justify-between
                     px-4 py-2 text-left"
        >
          <span className="text-[16px] font-medium tracking-[0.04em] text-faint">
            SEARCH ALL BOOKS {"//"}
          </span>
          <span className="font-mono text-[11px] text-faint">[⌘K]</span>
        </button>
        <div className="ml-auto flex shrink-0 items-center gap-5">
          <CorpusStatus />
          <Link to="/bookmarks"
            className="border border-edge-2 px-2.5 py-1.5 font-mono text-[11px]
                       uppercase tracking-[0.08em] text-cy transition-colors
                       duration-120 hover:border-yl hover:text-yl">
            BOOKMARKS [{bookmarks.items.length}]
          </Link>
        </div>
      </div>
    </header>
  );
}
