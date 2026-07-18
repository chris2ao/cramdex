import { Eyebrow } from "../components/ui/Text";
import { Panel } from "../components/ui/Panel";
import { CitationChip } from "../components/CitationChip";
import { useStore } from "../stores/useStore";
import { bookmarksStore, removeBookmark } from "../stores/bookmarks";

const DAY_MS = 24 * 60 * 60 * 1000;

/** Coarse, mono-friendly relative time label ("YESTERDAY", "2_DAYS_AGO", ...). */
function relativeTime(at: number): string {
  const days = Math.floor((Date.now() - at) / DAY_MS);
  if (days <= 0) return "TODAY";
  if (days === 1) return "YESTERDAY";
  if (days < 7) return `${days}_DAYS_AGO`;
  if (days < 14) return "LAST_WEEK";
  if (days < 30) return `${Math.floor(days / 7)}_WEEKS_AGO`;
  const months = Math.floor(days / 30);
  return months <= 1 ? "LAST_MONTH" : `${months}_MONTHS_AGO`;
}

export function Bookmarks() {
  const { items } = useStore(bookmarksStore);

  return (
    <div>
      <Eyebrow className="mb-2">PINNED_INTEL</Eyebrow>
      <h1 className="mb-1 text-[30px] font-bold uppercase tracking-wide text-fg">
        Bookmarks
      </h1>
      <p className="mono-label mb-6 text-[10px] text-faint">
        SAVED PAGES AND PASSAGES · {items.length} TOTAL
      </p>

      {items.length === 0 ? (
        <Panel className="p-6">
          <span className="mono-label text-xs text-faint">
            NO PINNED INTEL // SAVE PAGES FROM SEARCH, BOOKS, OR THE PAGE VIEWER
          </span>
        </Panel>
      ) : (
        <ul className="space-y-3">
          {items.map((item) => (
            <li key={item.id}>
              <Panel className="border-l-2 border-l-yl p-4">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <CitationChip label={item.label} slug={item.slug} page={item.page}
                                  text={`${item.label} p.${item.page}`} />
                    <span className="mono-label text-[10px] text-faint">
                      SAVED: {relativeTime(item.at)}
                    </span>
                  </div>
                  <button
                    onClick={() => removeBookmark(item.id)}
                    className="mono-label text-[10px] text-faint transition-colors
                               duration-120 hover:text-rd"
                  >
                    [REMOVE]
                  </button>
                </div>
                {item.note && <p className="text-base font-medium text-fg">{item.note}</p>}
              </Panel>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
