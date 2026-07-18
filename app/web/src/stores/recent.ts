import { createStore } from "./store";
import type { Store } from "./store";

export type RecentEntry = { slug: string; label: string; page: number; title?: string; at: number };
export type RecentState = { items: RecentEntry[] };
type RecentInput = { slug: string; label: string; page: number; title?: string };

const INITIAL: RecentState = { items: [] };
const CAP = 20;

function isRecentEntry(v: unknown): v is RecentEntry {
  if (typeof v !== "object" || v === null) return false;
  const e = v as Partial<RecentEntry>;
  return (
    typeof e.slug === "string" &&
    typeof e.label === "string" &&
    typeof e.page === "number" &&
    typeof e.at === "number" &&
    (e.title === undefined || typeof e.title === "string")
  );
}

function isRecentState(v: unknown): v is RecentState {
  if (typeof v !== "object" || v === null) return false;
  const items = (v as Partial<RecentState>).items;
  return Array.isArray(items) && items.every(isRecentEntry);
}

export const recentStore: Store<RecentState> = createStore("cramdex.recent", isRecentState, INITIAL);

/** Pushes a recently-viewed entry to the front, deduping by slug+page and capping at 20. */
export function pushRecent(entry: RecentInput): void {
  recentStore.set((state) => {
    const filtered = state.items.filter((i) => !(i.slug === entry.slug && i.page === entry.page));
    const items = [{ ...entry, at: Date.now() }, ...filtered];
    return { items: items.slice(0, CAP) };
  });
}
