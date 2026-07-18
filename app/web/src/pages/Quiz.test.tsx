import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { LightboxProvider } from "../components/Lightbox";
import { masteryStore } from "../stores/mastery";
import { resetCourseCache } from "../lib/course";
import { resetLlmCache } from "../lib/llm";
import { Quiz } from "./Quiz";

const DECK = { items: [
  { front: "Demo Cycle", back: "Lifecycle.", see: "Book 1 p.70", kind: "term", book: "Book 1" },
  { front: "PACES", back: "Planning options.", see: "Book B p.9", kind: "framework", book: "Book B" },
]};

const COURSE = { name: "Demo Course", exam_date: null, books: [
  { slug: "book1", label: "Book 1" }, { slug: "bookB", label: "Book B" },
]};

// topicOf maps these two cards to distinct topics. The promoted key is the
// normalized (uppercased) form of the card front; the label is the display
// form used everywhere else.
const TOPICS = {
  promoted: [{ key: "DEMO CYCLE", label: "Demo Cycle" }],
  themes: { "Book B": "Extras" },
  fallback: "General",
  order: ["Demo Cycle", "Extras", "General"],
};
const TOPIC = { "Demo Cycle": "Demo Cycle", PACES: "Extras" } as const;

const LLM_CONFIGURED = {
  name: "anthropic_api", display_name: "Anthropic API",
  configured: true, detail: "key present",
};
const LLM_UNCONFIGURED = {
  name: "claude_cli", display_name: "Claude CLI",
  configured: false, detail: "claude command not found on PATH",
};

// Shared course/topics/llm routing for fetch stubs below; returns undefined
// for URLs the caller must still handle itself (deck/generate endpoints).
function baseFetch(url: string): { ok: true; json: () => Promise<unknown> } | undefined {
  if (url.includes("/api/course")) return { ok: true, json: async () => COURSE };
  if (url.includes("/api/content/topics")) return { ok: true, json: async () => TOPICS };
  if (url.includes("/api/llm")) return { ok: true, json: async () => LLM_CONFIGURED };
  return undefined;
}

beforeEach(() => {
  window.localStorage.clear();
  masteryStore.set(() => ({ topics: {} }));
  resetCourseCache();
  resetLlmCache();
  vi.stubGlobal("fetch", vi.fn(async (url: string) =>
    baseFetch(url) ?? { ok: true, json: async () => DECK }) as any);
});

function renderQuiz() {
  return render(
    <MemoryRouter><LightboxProvider><Quiz /></LightboxProvider></MemoryRouter>);
}

// Which of the two seed cards is currently on screen.
function shownFront(): "Demo Cycle" | "PACES" {
  return screen.queryByText("Demo Cycle") ? "Demo Cycle" : "PACES";
}

test("flip reveals the answer, and HIT advances the counter", async () => {
  renderQuiz();
  await screen.findByText(/Demo Cycle|PACES/);
  expect(screen.queryByRole("button", { name: /hit/i })).not.toBeInTheDocument();

  await userEvent.click(screen.getByRole("button", { name: /reveal answer/i }));
  await userEvent.click(screen.getByRole("button", { name: /hit/i }));

  expect(screen.getByText(/HIT:\s*1/)).toBeInTheDocument();
});

test("completing the deck closes the round and resets the counter", async () => {
  renderQuiz();
  await screen.findByText(/Demo Cycle|PACES/);
  await userEvent.click(screen.getByRole("button", { name: /reveal answer/i }));
  await userEvent.click(screen.getByRole("button", { name: /hit/i }));
  await userEvent.click(screen.getByRole("button", { name: /reveal answer/i }));
  await userEvent.click(screen.getByRole("button", { name: /^miss$/i }));

  expect(screen.getByText(/HIT:\s*0/)).toBeInTheDocument();
  expect(screen.getByText(/ROUND COMPLETE/)).toBeInTheDocument();
  expect(screen.getByText(/HIT 1 · MISS 1/)).toBeInTheDocument();
});

test("source pills are disabled while generating AI questions", async () => {
  let resolveGenerate: (v: unknown) => void = () => {};
  const generatePromise = new Promise((r) => { resolveGenerate = r; });
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    if (url.includes("/api/quiz/generate")) return generatePromise;
    return baseFetch(url) ?? { ok: true, json: async () => DECK };
  }) as any);

  renderQuiz();
  await screen.findByText(/Demo Cycle|PACES/);
  await userEvent.click(screen.getByRole("button", { name: /5 ai questions/i }));
  expect(screen.getByRole("button", { name: "all" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "term" })).toBeDisabled();

  resolveGenerate({ ok: true, json: async () => ({ items: [] }) });
  await waitFor(() => expect(screen.getByRole("button", { name: "all" })).not.toBeDisabled());
});

test("disables the AI-generate pill and shows a notice when no LLM provider is configured", async () => {
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    if (url.includes("/api/llm")) return { ok: true, json: async () => LLM_UNCONFIGURED };
    return baseFetch(url) ?? { ok: true, json: async () => DECK };
  }) as any);

  renderQuiz();
  await screen.findByText(/Demo Cycle|PACES/);
  const notice = await screen.findByText(/AI questions need an LLM provider/i);
  expect(notice).toHaveTextContent(/Claude CLI/);
  expect(screen.getByRole("button", { name: /5 ai questions/i })).toBeDisabled();
  // The rest of the deck (flashcards, non-AI features) stays fully usable.
  expect(screen.getByRole("button", { name: /reveal answer/i })).toBeInTheDocument();
});

test("does not disable the AI-generate pill while the LLM status is still loading", async () => {
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    if (url.includes("/api/llm")) return new Promise(() => {}); // never resolves
    return baseFetch(url) ?? { ok: true, json: async () => DECK };
  }) as any);

  renderQuiz();
  await screen.findByText(/Demo Cycle|PACES/);
  expect(screen.getByRole("button", { name: /5 ai questions/i })).not.toBeDisabled();
  expect(screen.queryByText(/AI questions need an LLM provider/i)).not.toBeInTheDocument();
});

test("a stale deck response does not overwrite a newer source selection", async () => {
  const allDeck = { items: [{ front: "stale", back: "stale-back", see: "", kind: "term" }] };
  const termDeck = { items: [{ front: "fresh", back: "fresh-back", see: "", kind: "term" }] };
  let resolveSlow: (v: unknown) => void = () => {};
  const slowPromise = new Promise((r) => { resolveSlow = r; });
  let deckCalls = 0;
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    const base = baseFetch(url);
    if (base) return base;
    deckCalls += 1;
    if (deckCalls === 1) return slowPromise;
    return { ok: true, json: async () => termDeck };
  }) as any);

  renderQuiz();
  await userEvent.click(await screen.findByRole("button", { name: "term" }));
  await screen.findByText("fresh");

  resolveSlow({ ok: true, json: async () => allDeck });
  await new Promise((r) => setTimeout(r, 0));
  expect(screen.queryByText("stale")).not.toBeInTheDocument();
  expect(screen.getByText("fresh")).toBeInTheDocument();
});

test("grading records mastery for the shown card's topic", async () => {
  renderQuiz();
  await screen.findByText(/Demo Cycle|PACES/);
  const topic = TOPIC[shownFront()];

  await userEvent.click(screen.getByRole("button", { name: /reveal answer/i }));
  await userEvent.click(screen.getByRole("button", { name: /hit/i }));

  const stats = masteryStore.get().topics[topic];
  expect(stats).toBeDefined();
  expect(stats.got).toBe(1);
  expect(stats.missed).toBe(0);
});

test("space flips the card and H grades it as a hit", async () => {
  renderQuiz();
  await screen.findByText(/Demo Cycle|PACES/);
  expect(screen.getByRole("button", { name: /reveal answer/i })).toBeInTheDocument();

  fireEvent.keyDown(window, { key: " " });
  expect(await screen.findByRole("button", { name: /hit/i })).toBeInTheDocument();

  fireEvent.keyDown(window, { key: "h" });
  await waitFor(() => expect(screen.getByText(/HIT:\s*1/)).toBeInTheDocument());
});

test("M grades the flipped card as a miss", async () => {
  renderQuiz();
  await screen.findByText(/Demo Cycle|PACES/);

  fireEvent.keyDown(window, { key: " " });
  await screen.findByRole("button", { name: /^miss$/i });

  fireEvent.keyDown(window, { key: "m" });
  await waitFor(() => expect(screen.getByText(/MISS:\s*1/)).toBeInTheDocument());
});

test("arrow keys navigate between cards without grading", async () => {
  renderQuiz();
  await screen.findByText(/Demo Cycle|PACES/);
  const first = shownFront();

  fireEvent.keyDown(window, { key: "ArrowRight" });
  await waitFor(() => expect(shownFront()).not.toBe(first));

  fireEvent.keyDown(window, { key: "ArrowLeft" });
  await waitFor(() => expect(shownFront()).toBe(first));
  expect(screen.getByText(/HIT:\s*0/)).toBeInTheDocument();
  expect(screen.getByText(/MISS:\s*0/)).toBeInTheDocument();
});

test("PREV and NEXT buttons move between cards", async () => {
  renderQuiz();
  await screen.findByText(/Demo Cycle|PACES/);
  const first = shownFront();

  await userEvent.click(screen.getByRole("button", { name: /next card/i }));
  expect(shownFront()).not.toBe(first);

  await userEvent.click(screen.getByRole("button", { name: /previous card/i }));
  expect(shownFront()).toBe(first);
});

test("navigating away and back resets the flip to the front", async () => {
  renderQuiz();
  await screen.findByText(/Demo Cycle|PACES/);

  fireEvent.keyDown(window, { key: " " });
  await screen.findByRole("button", { name: /hit/i });

  fireEvent.keyDown(window, { key: "ArrowRight" });
  await waitFor(() =>
    expect(screen.getByRole("button", { name: /reveal answer/i })).toBeInTheDocument());
});

test("a graded card revisited shows a marker instead of grade buttons", async () => {
  renderQuiz();
  await screen.findByText(/Demo Cycle|PACES/);
  const first = shownFront();

  await userEvent.click(screen.getByRole("button", { name: /reveal answer/i }));
  await userEvent.click(screen.getByRole("button", { name: /hit/i }));

  // Grading advanced to the other card; go back to the graded one and flip.
  fireEvent.keyDown(window, { key: "ArrowLeft" });
  await waitFor(() => expect(shownFront()).toBe(first));
  fireEvent.keyDown(window, { key: " " });

  expect(await screen.findByText(/ALREADY GRADED THIS ROUND/)).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /hit/i })).not.toBeInTheDocument();

  // H must not double-count a graded card.
  fireEvent.keyDown(window, { key: "h" });
  expect(screen.getByText(/HIT:\s*1/)).toBeInTheDocument();
});

test("generating AI questions clears an active book filter", async () => {
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    if (url.includes("/api/quiz/generate")) {
      return { ok: true, json: async () => ({ items: [
        { question: "AI Q?", answer: "A.", see: "" },
      ] }) };
    }
    return baseFetch(url) ?? { ok: true, json: async () => DECK };
  }) as any);

  renderQuiz();
  await screen.findByText(/Demo Cycle|PACES/);
  await userEvent.click(screen.getByRole("button", { name: "Book 1" }));
  expect(screen.getByText(/CARD 1\/1/)).toBeInTheDocument();

  await userEvent.click(screen.getByRole("button", { name: /5 ai questions/i }));
  await waitFor(() => expect(screen.getByText(/CARD 1\/3/)).toBeInTheDocument());
});

test("book pills filter the deck to one book", async () => {
  renderQuiz();
  await screen.findByText(/Demo Cycle|PACES/);

  await userEvent.click(screen.getByRole("button", { name: "Book 1" }));
  expect(screen.getByText("Demo Cycle")).toBeInTheDocument();
  expect(screen.queryByText("PACES")).not.toBeInTheDocument();
  expect(screen.getByText(/CARD 1\/1/)).toBeInTheDocument();

  await userEvent.click(screen.getByRole("button", { name: "all books" }));
  expect(screen.getByText(/CARD 1\/2/)).toBeInTheDocument();
});

test("modifier chords never grade or navigate", async () => {
  renderQuiz();
  await screen.findByText(/Demo Cycle|PACES/);
  const first = shownFront();

  fireEvent.keyDown(window, { key: " " });
  await screen.findByRole("button", { name: /hit/i });

  fireEvent.keyDown(window, { key: "h", metaKey: true });
  fireEvent.keyDown(window, { key: "m", ctrlKey: true });
  fireEvent.keyDown(window, { key: "ArrowRight", altKey: true });

  expect(screen.getByText(/HIT:\s*0/)).toBeInTheDocument();
  expect(screen.getByText(/MISS:\s*0/)).toBeInTheDocument();
  expect(shownFront()).toBe(first);
});

test("reselecting the active book pill does not reset the round", async () => {
  renderQuiz();
  await screen.findByText(/Demo Cycle|PACES/);

  await userEvent.click(screen.getByRole("button", { name: /reveal answer/i }));
  await userEvent.click(screen.getByRole("button", { name: /hit/i }));
  expect(screen.getByText(/HIT:\s*1/)).toBeInTheDocument();

  await userEvent.click(screen.getByRole("button", { name: "all books" }));
  expect(screen.getByText(/HIT:\s*1/)).toBeInTheDocument();
});

test("keyboard grading is ignored while an input is focused", async () => {
  renderQuiz();
  await screen.findByText(/Demo Cycle|PACES/);

  const input = document.createElement("input");
  document.body.appendChild(input);
  input.focus();
  fireEvent.keyDown(input, { key: " " });

  expect(screen.getByRole("button", { name: /reveal answer/i })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /hit/i })).not.toBeInTheDocument();
  input.remove();
});

test("the flip hint is visible before the card is flipped", async () => {
  renderQuiz();
  await screen.findByText(/Demo Cycle|PACES/);
  expect(screen.getByText(/\[SPACE\]=FLIP/)).toBeInTheDocument();
});

test("weak mode shows an empty-mastery notice that clears after a grade", async () => {
  renderQuiz(); // default source is weak_areas, mastery reset to empty
  await screen.findByText(/Demo Cycle|PACES/);
  expect(screen.getByText(/NO WEAK-AREA DATA YET/)).toBeInTheDocument();

  await userEvent.click(screen.getByRole("button", { name: /reveal answer/i }));
  await userEvent.click(screen.getByRole("button", { name: /hit/i }));

  expect(screen.queryByText(/NO WEAK-AREA DATA YET/)).not.toBeInTheDocument();
});

test("weak_areas mode presents every card and records each grade", async () => {
  renderQuiz(); // default source is weak_areas
  await screen.findByText(/Demo Cycle|PACES/);
  expect(screen.getByText(/TARGETING WEAK AREAS/)).toBeInTheDocument();

  const seen = new Set<string>();
  for (let i = 0; i < DECK.items.length; i++) {
    seen.add(shownFront());
    await userEvent.click(screen.getByRole("button", { name: /reveal answer/i }));
    await userEvent.click(screen.getByRole("button", { name: /hit/i }));
  }

  expect(seen).toEqual(new Set(["Demo Cycle", "PACES"]));
  const total = Object.values(masteryStore.get().topics)
    .reduce((a, t) => a + t.got + t.missed, 0);
  expect(total).toBe(DECK.items.length);
});
