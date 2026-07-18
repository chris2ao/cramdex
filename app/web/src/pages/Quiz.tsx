import { useCallback, useEffect, useMemo, useState } from "react";
import { get } from "../api";
import { CitationText } from "../components/CitationText";
import { MarkdownView } from "../components/MarkdownView";
import { useLightbox } from "../components/Lightbox";
import { Eyebrow } from "../components/ui/Text";
import { Pill } from "../components/ui/Pill";
import { Bar } from "../components/ui/Bar";
import { Panel } from "../components/ui/Panel";
import { ButtonPrimary, ButtonSecondary } from "../components/ui/Button";
import { useStore } from "../stores/useStore";
import { masteryStore, recordGrade, isWeak } from "../stores/mastery";
import { firstBookLabel, topicOf, weightedDeck } from "../lib/topics";
import { useCourse, useTopics } from "../lib/course";
import type { TopicsConfig } from "../lib/course";
import { useLlmGuard } from "../lib/llm";

type Card = { front: string; back: string; see: string; kind: string; book: string };
const SOURCES = ["weak_areas", "all", "term", "framework", "acronym"] as const;
type Source = (typeof SOURCES)[number];

function shuffle<T>(arr: T[]): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// A key press should not grade the card when the user is typing into a field
// or the command palette. Checks both the event target and the focused element.
function isTypingContext(target: EventTarget | null): boolean {
  const nodes: Array<Element | null> = [];
  if (target instanceof HTMLElement) nodes.push(target);
  nodes.push(document.activeElement);
  return nodes.some((node) => {
    if (!(node instanceof HTMLElement)) return false;
    const tag = node.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || node.isContentEditable) return true;
    return node.closest("[cmdk-root]") !== null;
  });
}

// The weak-area label for a card: the topic name upcased with underscores.
function weakLabel(card: Card, topics: TopicsConfig): string {
  return topicOf(card, topics).toUpperCase().replace(/\s+/g, "_");
}

// Next card that has not been graded this round, scanning forward with
// wrap. Pure (takes the deck length explicitly) so it can be a stable
// module-level helper rather than a closure recreated every render.
function nextUngraded(total: number, from: number, graded: Map<number, boolean>): number {
  for (let step = 1; step <= total; step++) {
    const i = (from + step) % total;
    if (!graded.has(i)) return i;
  }
  return from; // unreachable: the caller guarantees an ungraded card exists
}

export function Quiz() {
  const topics = useTopics();
  const course = useCourse();
  const [source, setSource] = useState<Source>("weak_areas");
  const [book, setBook] = useState<string>("all");
  const [deck, setDeck] = useState<Card[]>([]);
  const [idx, setIdx] = useState(0);
  const [flipped, setFlipped] = useState(false);
  // The round's single source of truth: card index -> grade. HIT/MISS counts,
  // progress, and per-card graded state all derive from it.
  const [results, setResults] = useState<Map<number, boolean>>(new Map());
  const [lastRound, setLastRound] = useState<{ got: number; missed: number } | null>(null);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");
  const mastery = useStore(masteryStore);
  const { isOpen } = useLightbox();
  const { llm, llmUnconfigured } = useLlmGuard();

  // The deck the round runs over: the fetched deck, narrowed by book filter.
  const cards = useMemo(
    () => (book === "all" ? deck : deck.filter((c) => c.book === book)),
    [deck, book],
  );
  const card = cards[idx];
  const isGraded = results.has(idx);
  const score = useMemo(() => {
    let got = 0;
    let missed = 0;
    results.forEach((hit) => (hit ? got++ : missed++));
    return { got, missed };
  }, [results]);
  // Only offer book pills the current deck can actually serve, in manifest order.
  const books = useMemo(() => {
    const present = new Set(deck.map((c) => c.book));
    return (course?.books.map((b) => b.label) ?? []).filter((label) => present.has(label));
  }, [deck, course]);
  // True until any topic has a graded attempt, so weak mode can be honest that
  // it is running a plain shuffle rather than a real weak-area profile.
  const noMasteryData = Object.values(mastery.topics)
    .every((t) => t.got + t.missed === 0);

  function resetRound() {
    setIdx(0);
    setFlipped(false);
    setResults(new Map());
    setLastRound(null);
  }

  function selectBook(b: string) {
    if (b === book) return; // reselecting the active pill must not reset the round
    setBook(b);
    resetRound();
  }

  useEffect(() => {
    if (!topics) return; // wait for the taxonomy before fetching/ordering the deck
    let cancelled = false;
    setError("");
    const apiSource = source === "weak_areas" ? "all" : source;
    get<{ items: Card[] }>(`/api/quiz/deck?source=${apiSource}`)
      .then((b) => {
        if (cancelled) return;
        // weak_areas orders the full deck by mastery; other modes shuffle.
        const ordered = source === "weak_areas"
          ? weightedDeck(b.items, masteryStore.get().topics, topics)
          : shuffle(b.items);
        setDeck(ordered);
        setBook("all");
        resetRound();
      })
      .catch((e) => { if (!cancelled) setError((e as Error).message); });
    return () => { cancelled = true; };
  }, [source, topics]);

  const grade = useCallback((got: boolean) => {
    if (!card || isGraded || !topics) return;
    recordGrade(topicOf(card, topics), got);
    const next = new Map(results);
    next.set(idx, got);
    setFlipped(false);
    if (next.size >= cards.length) {
      setLastRound({
        got: score.got + (got ? 1 : 0),
        missed: score.missed + (got ? 0 : 1),
      });
      setResults(new Map());
      setIdx(0);
    } else {
      setResults(next);
      setIdx(nextUngraded(cards.length, idx, next));
    }
  }, [card, isGraded, topics, results, idx, cards, score]);

  // Free navigation in either direction, independent of grading.
  const move = useCallback((delta: number) => {
    if (!cards.length) return;
    setIdx((i) => (i + delta + cards.length) % cards.length);
    setFlipped(false);
  }, [cards]);

  async function generate() {
    if (!course || llmUnconfigured) return;
    setGenerating(true); setError("");
    try {
      const res = await fetch("/api/quiz/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic: "", count: 5 }),
      });
      if (!res.ok) throw new Error((await res.json()).detail ?? res.statusText);
      const body = await res.json();
      const labels = course.books.map((b) => b.label);
      const fresh = body.items.map((i: any) => ({
        front: i.question, back: i.answer, see: i.see, kind: "ai",
        book: firstBookLabel(i.see ?? "", labels) ?? "",
      }));
      setDeck((d) => shuffle([...fresh, ...d]));
      // Clear any book filter too: the new cards must be visible, and they
      // may cite any book (or none).
      setBook("all");
      resetRound();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setGenerating(false);
    }
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (isOpen || !card) return;
      if (isTypingContext(e.target)) return;
      // Chords belong to the browser/OS (Cmd+M minimize, Alt+arrow history,
      // ...): never treat them as quiz input.
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === " " || e.key === "Spacebar") {
        e.preventDefault();
        setFlipped((f) => !f);
        return;
      }
      if (e.key === "ArrowLeft") { e.preventDefault(); move(-1); return; }
      if (e.key === "ArrowRight") { e.preventDefault(); move(1); return; }
      if (!flipped || isGraded) return;
      const k = e.key.toLowerCase();
      if (k === "h") grade(true);
      else if (k === "m") grade(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // grade/move are memoized above with their own exact dependencies
    // (card, isGraded, topics, results, idx, cards, score for grade; cards
    // for move), so listing them here is sufficient: the handler picks up
    // fresh state whenever anything it or they depend on changes.
  }, [isOpen, card, flipped, isGraded, grade, move]);

  if (!topics || !course) return null;

  return (
    <div className="max-w-[840px]">
      <div className="mb-4 flex items-end justify-between gap-4">
        <div>
          <Eyebrow color="rd" className="mb-2">COMBAT_SIM</Eyebrow>
          <h1 className="text-[30px] font-bold uppercase tracking-[0.02em]">Quiz</h1>
          <p className="mono-label mt-1.5 text-[11px] text-faint">
            CARD {cards.length ? idx + 1 : 0}/{cards.length}
            {" · GRADED "}{results.size}/{cards.length}
            {source === "weak_areas" && " · TARGETING WEAK AREAS"}
          </p>
          {lastRound && (
            <p className="mono-label mt-1 text-[11px] text-faint">
              ROUND COMPLETE · HIT {lastRound.got} · MISS {lastRound.missed}
            </p>
          )}
        </div>
        <div className="mono-label flex gap-4 text-[13px]">
          <span className="text-gn">HIT: {score.got}</span>
          <span className="text-rd">MISS: {score.missed}</span>
        </div>
      </div>

      <div className="mb-2 flex flex-wrap gap-1.5">
        {SOURCES.map((s) => (
          <Pill key={s} active={source === s} disabled={generating}
            onClick={() => setSource(s)}>
            {s}
          </Pill>
        ))}
        <Pill color="yl" active={generating} disabled={generating || llmUnconfigured}
              onClick={generate}>
          {generating ? "GENERATING..." : "+5 AI QUESTIONS"}
        </Pill>
      </div>

      {llm && !llm.configured && (
        <p className="mono-label mb-4 text-[10px] text-rd">
          AI questions need an LLM provider. Active: {llm.display_name}. {llm.detail}
        </p>
      )}

      {books.length > 0 && (
        <div className="mb-4 flex flex-wrap gap-1.5">
          <Pill active={book === "all"} disabled={generating}
            onClick={() => selectBook("all")}>
            all books
          </Pill>
          {books.map((b) => (
            <Pill key={b} active={book === b} disabled={generating}
              onClick={() => selectBook(b)}>
              {b}
            </Pill>
          ))}
        </div>
      )}

      {source === "weak_areas" && noMasteryData && (
        <p className="mono-label mb-4 text-[10px] text-faint">
          NO WEAK-AREA DATA YET // GRADES WILL BUILD YOUR PROFILE
        </p>
      )}

      <Bar value={cards.length ? (results.size / cards.length) * 100 : 0}
        color="yl" height={6} className="mb-4" />

      {error && <p className="mb-4 text-sm text-rd">{error}</p>}

      {!card && deck.length > 0 && (
        <Panel className="p-7">
          <p className="mono-label text-[11px] text-faint">
            NO CARDS MATCH THIS FILTER
          </p>
        </Panel>
      )}

      {card && (
        <Panel bracket={["yl-tl", "yl-br"]} bracketSize={16}
          className="flex min-h-[300px] flex-col p-7">
          <div className="mb-[18px] flex items-start justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="bg-yl px-2 py-0.5 font-mono text-[10px] uppercase
                               tracking-[0.15em] text-black">
                {card.kind}
              </span>
              {card.book && (
                <span className="mono-label text-[10px] text-faint">
                  {card.book.toUpperCase()}
                </span>
              )}
              {isGraded && (
                <span className="mono-label text-[10px] text-gn">✓ GRADED</span>
              )}
            </div>
            {isWeak(mastery, topicOf(card, topics)) && (
              <span className="mono-label text-[10px] text-rd">
                ⚠ WEAK_AREA: {weakLabel(card, topics)}
              </span>
            )}
          </div>

          <div className="mb-auto text-[24px] font-semibold leading-[1.45]">
            {card.front}
          </div>

          {flipped ? (
            <div className="mt-6">
              <div className="mb-[18px] border-t border-edge pt-4 text-[17px] text-muted">
                <MarkdownView markdown={card.back} />
                {card.see && (
                  <div className="mt-2 text-sm"><CitationText text={card.see} /></div>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-3">
                {isGraded ? (
                  <span className="mono-label text-[10px] text-faint">
                    ALREADY GRADED THIS ROUND
                  </span>
                ) : (
                  <>
                    <ButtonPrimary onClick={() => grade(true)}>HIT ▸</ButtonPrimary>
                    <ButtonSecondary onClick={() => grade(false)}>MISS</ButtonSecondary>
                  </>
                )}
                <span className="mono-label ml-auto text-[10px] text-faint">
                  [H]=HIT [M]=MISS [←→]=NAV
                </span>
              </div>
            </div>
          ) : (
            <div className="mt-6 flex flex-wrap items-center gap-3">
              <ButtonSecondary onClick={() => setFlipped(true)}>
                REVEAL ANSWER ▸
              </ButtonSecondary>
              <span className="mono-label text-[10px] text-faint">
                [SPACE]=FLIP [←→]=NAV
              </span>
            </div>
          )}

          <div className="mt-4 flex items-center justify-between border-t border-edge pt-3">
            <ButtonSecondary onClick={() => move(-1)} aria-label="previous card">
              ◂ PREV
            </ButtonSecondary>
            <ButtonSecondary onClick={() => move(1)} aria-label="next card">
              NEXT ▸
            </ButtonSecondary>
          </div>
        </Panel>
      )}
    </div>
  );
}
