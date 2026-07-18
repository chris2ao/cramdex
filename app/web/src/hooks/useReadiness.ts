import { useFetch } from "./useFetch";
import { useStore } from "../stores/useStore";
import { readingStore, bookPct } from "../stores/reading";
import { masteryStore, topicMastery } from "../stores/mastery";
import { labsStore, labDone } from "../stores/labs";
import { computeReadiness } from "../stores/readiness";
import { useTopics } from "../lib/course";

export type BookInfo = { slug: string; label: string; pages: number };
type LabsResponse = {
  items: Array<{ book: string; labs: Array<{ id: string; comparison: string | null }> }>;
};

/**
 * Combines corpus metadata with the local study stores into the readiness
 * blend (40% books read, 40% quiz mastery, 20% labs done). Shared by the
 * sidebar footer and the dashboard.
 */
export function useReadiness() {
  const { data: booksData } = useFetch<{ items: BookInfo[] }>("/api/content/books");
  const { data: labsData } = useFetch<LabsResponse>("/api/content/labs");
  const reading = useStore(readingStore);
  const mastery = useStore(masteryStore);
  const labOverrides = useStore(labsStore);
  const topics = useTopics();

  const books = booksData?.items ?? [];
  const bookPcts = books.map((b) => bookPct(reading, b.slug, b.pages));
  const allLabs = (labsData?.items ?? []).flatMap((g) => g.labs);
  const labsDone = allLabs.filter(
    (l) => labDone(labOverrides, l.id, l.comparison != null)).length;
  const topicMasteries = (topics?.order ?? []).map((t) => topicMastery(mastery, t));

  const blend = computeReadiness({
    bookPcts, topicMasteries, labsDone, labsTotal: allLabs.length,
  });
  return {
    overall: blend.overall,
    mastery: blend.mastery,
    labs: blend.labs,
    booksPct: blend.books,
    books,
    labsDone,
    labsTotal: allLabs.length,
  };
}
