import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { recordPagePeek } from "../stores/reading";
import { pushRecent } from "../stores/recent";
import { useStore } from "../stores/useStore";
import { bookmarksStore, addBookmark, removeBookmark, isBookmarked } from "../stores/bookmarks";
import { AddToIndexButton } from "./IndexCapture";
import { ButtonSecondary } from "./ui/Button";

type Target = { slug: string; label: string; page: number };
const LightboxContext = createContext<{ open: (t: Target) => void; isOpen: boolean }>(
  { open: () => {}, isOpen: false });
export const useLightbox = () => useContext(LightboxContext);

function BookmarkToggle({ target }: { target: Target }) {
  const bookmarks = useStore(bookmarksStore);
  const saved = isBookmarked(bookmarks, target.slug, target.page);
  return (
    <button
      onClick={() => saved
        ? removeBookmark(`${target.slug}:${target.page}`)
        : addBookmark({ slug: target.slug, label: target.label,
                        page: target.page, note: "" })}
      className={`mono-label px-2 text-[10px] transition-colors duration-120 ${
        saved ? "text-yl" : "text-faint hover:text-yl"}`}
    >
      {saved ? "[SAVED]" : "[+SAVE]"}
    </button>
  );
}

export function LightboxProvider({ children }: { children: React.ReactNode }) {
  const [target, setTarget] = useState<Target | null>(null);
  const [failed, setFailed] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const open = useCallback((t: Target) => {
    setFailed(false);
    setTarget(t);
    pushRecent({ slug: t.slug, label: t.label, page: t.page });
  }, []);
  const shift = (d: number) => {
    setFailed(false);
    setTarget((t) => (t ? { ...t, page: Math.max(1, t.page + d) } : t));
  };

  // A lightbox open is a peek: it counts the page as seen for reading
  // progress but must not move the book's resume position.
  useEffect(() => {
    if (target) recordPagePeek(target.slug, target.page);
  }, [target]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!target) return;
      const el = document.activeElement as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable)) return;
      if (e.key === "Escape") setTarget(null);
      if (e.key === "ArrowLeft") { e.preventDefault(); shift(-1); }
      if (e.key === "ArrowRight") { e.preventDefault(); shift(1); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [target]);

  const isOpen = target !== null;
  useEffect(() => {
    if (isOpen) panelRef.current?.focus();
  }, [isOpen]);

  return (
    <LightboxContext.Provider value={{ open, isOpen }}>
      {children}
      {target && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-6"
             onClick={() => setTarget(null)}>
          <div ref={panelRef} role="dialog" aria-modal="true" tabIndex={-1}
               className="max-h-full overflow-auto border border-edge-2 bg-panel p-3
                          outline-none"
               onClick={(e) => e.stopPropagation()}>
            <div className="mb-2 flex items-center justify-between gap-3 text-sm">
              <ButtonSecondary onClick={() => shift(-1)} className="px-2 py-1 text-xs">
                ◂ PREV
              </ButtonSecondary>
              <span className="mono-label text-xs text-cy">
                {target.label.toUpperCase()} {"//"} P.{target.page}
              </span>
              <div className="flex items-center gap-1">
                <BookmarkToggle target={target} />
                <AddToIndexButton slug={target.slug} label={target.label} page={target.page} />
                <ButtonSecondary onClick={() => shift(1)} className="px-2 py-1 text-xs">
                  NEXT ▸
                </ButtonSecondary>
              </div>
            </div>
            {failed ? (
              <p className="max-w-md p-8 text-muted">
                Page unavailable. Check that the source PDFs are reachable and the
                courseware password is configured (see the corpus status in the top bar).
              </p>
            ) : (
              <img
                src={`/api/page/${target.slug}/${target.page}.png`}
                alt={`${target.label} page ${target.page}`}
                className="max-w-[80vw]"
                onError={() => setFailed(true)}
              />
            )}
          </div>
        </div>
      )}
    </LightboxContext.Provider>
  );
}
