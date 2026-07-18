// Quiz topic taxonomy for per-topic mastery tracking and weak-area drilling.
// The taxonomy itself comes from the course pack via /api/content/topics
// (TopicsConfig); this module only routes cards and weights decks.

import type { TopicsConfig } from "./course";

type CardLike = { front: string; see: string; kind: string; book?: string };
type Mastery = { got: number; missed: number };

// Reduce a card front to a stable lookup key: text before any dash
// separator, parentheticals and quotes removed, whitespace collapsed, upper.
function normalizeKey(front: string): string {
  const head = front.split(/[–—]/)[0];
  return head
    .replace(/\([^)]*\)/g, " ")
    .replace(/["'“”‘’]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

// First configured book label appearing in a citation, or null. Longest
// labels first so one label cannot shadow another that it prefixes.
export function firstBookLabel(see: string, labels: string[]): string | null {
  const ordered = [...labels].sort((a, b) => b.length - a.length);
  for (const label of ordered) {
    const pattern = new RegExp(
      label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+") + "(?!\\w)");
    const m = see.match(pattern);
    if (m) return label;
  }
  return null;
}

export function topicOf(card: CardLike, topics: TopicsConfig): string {
  const key = normalizeKey(card.front);
  const promoted = topics.promoted.find((p) => p.key === key);
  if (promoted) return promoted.label;
  const labels = Object.keys(topics.themes);
  const book = card.book || firstBookLabel(card.see, labels);
  if (book && book in topics.themes) return topics.themes[book];
  return topics.fallback;
}

// Selection weight for a topic: 1 (mastered) up to 4 (all-wrong), with
// unattempted topics at 2 so new material surfaces but known-weak dominates.
function topicWeight(m: Mastery | undefined): number {
  const seen = m ? m.got + m.missed : 0;
  if (seen === 0) return 2;
  const ratio = m!.got / seen;
  return 1 + 3 * (1 - ratio);
}

// Weak-areas quiz mode: weighted sampling without replacement via the
// Efraimidis-Spirakis key trick. Returns a new array; input never mutated.
export function weightedDeck<T extends CardLike>(
  cards: T[],
  masteryByTopic: Record<string, Mastery>,
  topics: TopicsConfig,
  rand: () => number = Math.random,
): T[] {
  const keyed = cards.map((card) => {
    const weight = topicWeight(masteryByTopic[topicOf(card, topics)]);
    const u = Math.min(Math.max(rand(), Number.MIN_VALUE), 1);
    return { card, sortKey: Math.pow(u, 1 / weight) };
  });
  return [...keyed].sort((a, b) => b.sortKey - a.sortKey).map((k) => k.card);
}
