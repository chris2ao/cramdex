import { describe, expect, it } from "vitest";
import { firstBookLabel, topicOf, weightedDeck } from "./topics";
import type { TopicsConfig } from "./course";

// Deterministic PRNG (mulberry32) so weightedDeck tests are reproducible.
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Card = { front: string; see: string; kind: string; book?: string };
const card = (front: string, see: string, kind: string, book?: string): Card =>
  ({ front, see, kind, book });

// Fictional taxonomy fixture: one promoted framework, two book themes, a
// fallback, and a display order covering all of them.
const CFG: TopicsConfig = {
  promoted: [{ key: "DEMO-CYCLE", label: "Demo Cycle" }],
  themes: { "Book 1": "Fundamentals", Workbook: "Workbook" },
  fallback: "General",
  order: ["Demo Cycle", "Fundamentals", "Workbook", "General"],
};

describe("firstBookLabel", () => {
  it("does not partial-match a longer book number", () => {
    expect(firstBookLabel("Book 12 p.5", ["Book 1"])).toBeNull();
  });

  it("matches an exact label before a citation", () => {
    expect(firstBookLabel("see Book 1 p.5", ["Book 1"])).toBe("Book 1");
  });
});

describe("topicOf", () => {
  it("routes a promoted-framework card to its own topic ahead of any book field", () => {
    expect(topicOf(card("Demo-Cycle", "", "framework", "Book 1"), CFG)).toBe("Demo Cycle");
  });

  it("normalizes parentheticals and quotes before matching a promoted key", () => {
    expect(topicOf(card('"Demo-Cycle" (the steps)', "", "framework"), CFG)).toBe("Demo Cycle");
  });

  it("falls through to the book's theme when the front does not match a promoted key", () => {
    expect(topicOf({ front: "Demo Cycle steps", see: "", kind: "term", book: "Book 1" }, CFG)).toBe(
      "Fundamentals",
    );
  });

  it("prefers the server-derived book field over citation parsing", () => {
    expect(topicOf({ front: "X", see: "Book 1 p.5", kind: "term", book: "Workbook" }, CFG)).toBe(
      "Workbook",
    );
  });

  it("buckets by the first configured book label found in the citation when no book field is set", () => {
    expect(topicOf(card("Other", "Workbook p.12", "term"), CFG)).toBe("Workbook");
  });

  it("falls back to the configured fallback when nothing parses", () => {
    expect(topicOf(card("Unrelated card", "", "term", "Nonexistent Book"), CFG)).toBe("General");
    expect(topicOf(card("Loose scenario", "see the slides", "ai"), CFG)).toBe("General");
  });

  it("is stable: the same card always maps to the same topic", () => {
    const c = card("Other", "Workbook p.12", "term");
    expect(topicOf(c, CFG)).toBe(topicOf(c, CFG));
  });

  it("only ever emits topics that are in the configured order", () => {
    const samples = [
      card("Demo-Cycle", "", "framework"),
      card("Other", "Book 1 p.9", "term"),
      card("Other", "Workbook p.12", "term"),
      card("nope", "", "ai"),
    ];
    for (const c of samples) expect(CFG.order).toContain(topicOf(c, CFG));
  });
});

describe("weightedDeck", () => {
  const weak: Card = { front: "BC", see: "", kind: "acronym", book: "Workbook" }; // topic Workbook
  const strong: Card = { front: "AD", see: "", kind: "acronym", book: "Book 1" }; // topic Fundamentals
  const fresh: Card = { front: "Demo-Cycle", see: "", kind: "framework" }; // topic Demo Cycle (unattempted)
  const mastery = {
    Workbook: { got: 0, missed: 6 }, // m = 0 -> weight 4
    Fundamentals: { got: 6, missed: 0 }, // m = 1 -> weight 1
  };

  it("returns every card exactly once (no loss, no duplication)", () => {
    const deck = [weak, strong, fresh, card("Other", "Book 1 p.5", "term")];
    const out = weightedDeck(deck, mastery, CFG, mulberry32(1));
    expect(out).toHaveLength(deck.length);
    expect(new Set(out)).toEqual(new Set(deck));
  });

  it("does not mutate the input array", () => {
    const deck = [weak, strong, fresh];
    const copy = [...deck];
    weightedDeck(deck, mastery, CFG, mulberry32(7));
    expect(deck).toEqual(copy);
  });

  it("is deterministic for a given seed", () => {
    const deck = [weak, strong, fresh];
    const a = weightedDeck(deck, mastery, CFG, mulberry32(42)).map((c) => c.front);
    const b = weightedDeck(deck, mastery, CFG, mulberry32(42)).map((c) => c.front);
    expect(a).toEqual(b);
  });

  it("surfaces weak topics earlier than mastered ones on average", () => {
    const deck = [weak, strong];
    const trials = 400;
    let weakPos = 0;
    let strongPos = 0;
    for (let s = 1; s <= trials; s++) {
      const out = weightedDeck(deck, mastery, CFG, mulberry32(s));
      weakPos += out.indexOf(weak);
      strongPos += out.indexOf(strong);
    }
    expect(weakPos / trials).toBeLessThan(strongPos / trials);
  });

  it("orders failing < unattempted < mastered on average", () => {
    const deck = [weak, fresh, strong];
    const trials = 600;
    let w = 0;
    let f = 0;
    let s = 0;
    for (let seed = 1; seed <= trials; seed++) {
      const out = weightedDeck(deck, mastery, CFG, mulberry32(seed));
      w += out.indexOf(weak);
      f += out.indexOf(fresh);
      s += out.indexOf(strong);
    }
    expect(w / trials).toBeLessThan(f / trials);
    expect(f / trials).toBeLessThan(s / trials);
  });

  it("handles an empty deck", () => {
    expect(weightedDeck([], mastery, CFG, mulberry32(1))).toEqual([]);
  });

  it("works with the default Math.random", () => {
    const deck = [weak, strong, fresh];
    const out = weightedDeck(deck, {}, CFG);
    expect(new Set(out)).toEqual(new Set(deck));
  });
});
