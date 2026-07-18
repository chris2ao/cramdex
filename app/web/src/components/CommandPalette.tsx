import { Command } from "cmdk";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { get } from "../api";
import { useLightbox } from "./Lightbox";
import { OPEN_PALETTE_EVENT } from "./TopBar";

type Hit = { slug: string; label: string; printed_page: number; snippet: string };

const NAV: Array<[string, string]> = [
  ["/", "Dashboard"], ["/books", "Books"], ["/search", "Search"], ["/ask", "Ask"],
  ["/frameworks", "Frameworks"], ["/glossary", "Glossary"], ["/slides", "Slide Index"],
  ["/labs", "Labs"], ["/notes", "Notes"], ["/bookmarks", "Bookmarks"],
  ["/assets", "Assets"], ["/quiz", "Quiz"], ["/index", "Exam Index"],
];

const ITEM_CLASS =
  "cursor-pointer px-3 py-2 text-fg data-[selected=true]:bg-yl-dim " +
  "data-[selected=true]:text-yl";

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [errored, setErrored] = useState(false);
  const navigate = useNavigate();
  const { open: openPage } = useLightbox();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    const onOpenEvent = () => setOpen(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener(OPEN_PALETTE_EVENT, onOpenEvent);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener(OPEN_PALETTE_EVENT, onOpenEvent);
    };
  }, []);

  useEffect(() => {
    setErrored(false);
    if (!open || q.trim().length < 3) { setHits([]); return; }
    let cancelled = false;
    const t = setTimeout(() => {
      get<{ results: Hit[] }>(
        `/api/search?${new URLSearchParams({ q, mode: "or", limit: "8" })}`
      ).then((b) => { if (!cancelled) { setHits(b.results); setErrored(false); } })
       .catch(() => { if (!cancelled) { setHits([]); setErrored(true); } });
    }, 200);
    return () => { cancelled = true; clearTimeout(t); };
  }, [q, open]);

  return (
    <Command.Dialog open={open} onOpenChange={setOpen} shouldFilter={false}
      label="Command palette"
      className="fixed left-1/2 top-24 z-50 w-[min(40rem,90vw)] -translate-x-1/2
                 border border-edge-2 bg-panel p-2 shadow-2xl">
      <Command.Input value={q} onValueChange={setQ}
        placeholder="JUMP TO A SECTION OR SEARCH THE BOOKS //"
        className="mono-label w-full border-b border-edge bg-transparent px-3 py-2
                   text-sm text-fg outline-none placeholder:text-faint" />
      <Command.List className="max-h-80 overflow-auto">
        <Command.Group heading="Sections"
          className="mono-label px-3 pt-2 text-[10px] text-faint
                     [&_[cmdk-item]]:text-sm [&_[cmdk-item]]:font-sans
                     [&_[cmdk-item]]:normal-case [&_[cmdk-item]]:tracking-normal">
          {NAV.filter(([, l]) => l.toLowerCase().includes(q.toLowerCase())).map(
            ([to, label]) => (
              <Command.Item key={to}
                onSelect={() => { setOpen(false); navigate(to); }}
                className={ITEM_CLASS}>
                {label}
              </Command.Item>
            ))}
        </Command.Group>
        {(hits.length > 0 || (errored && q.trim().length >= 3)) && (
          <Command.Group heading="Corpus"
            className="mono-label px-3 pt-2 text-[10px] text-faint
                       [&_[cmdk-item]]:text-sm [&_[cmdk-item]]:font-sans
                       [&_[cmdk-item]]:normal-case [&_[cmdk-item]]:tracking-normal">
            {errored ? (
              <div className="px-3 py-2 text-sm text-muted">corpus search unavailable</div>
            ) : (
              hits.map((h, i) => (
                <Command.Item key={i}
                  onSelect={() => {
                    setOpen(false);
                    openPage({ slug: h.slug, label: h.label, page: h.printed_page });
                  }}
                  className={ITEM_CLASS}>
                  {h.label} p.{h.printed_page}: {h.snippet.replace(/\[\[|\]\]/g, "").slice(0, 80)}
                </Command.Item>
              ))
            )}
          </Command.Group>
        )}
      </Command.List>
    </Command.Dialog>
  );
}
