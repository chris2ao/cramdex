import { Link } from "react-router-dom";
import { Eyebrow, MonoLabel } from "../components/ui/Text";
import { Panel } from "../components/ui/Panel";
import { Bar } from "../components/ui/Bar";
import type { BarColor } from "../components/ui/Bar";
import { btnPrimary, btnSecondary } from "../components/ui/Button";
import { CitationChip } from "../components/CitationChip";
import { useFetch } from "../hooks/useFetch";
import { useReadiness } from "../hooks/useReadiness";
import type { BookInfo } from "../hooks/useReadiness";
import { useStore } from "../stores/useStore";
import { examIndexStore } from "../stores/examIndex";
import { readingStore, bookPct } from "../stores/reading";
import type { ReadingState } from "../stores/reading";
import { recentStore } from "../stores/recent";
import type { RecentEntry } from "../stores/recent";
import { masteryStore, topicMastery, isWeak } from "../stores/mastery";
import type { MasteryState } from "../stores/mastery";
import { useTopics } from "../lib/course";

type BookPct = { book: BookInfo; pct: number };

function bookCode(slug: string): string {
  const numeric = slug.match(/^book([1-5])$/);
  if (numeric) return `BK_${numeric[1]}`;
  if (slug === "bookB") return "BK_B";
  if (slug === "workbook") return "WKBK";
  return slug.toUpperCase();
}

function relativeTime(at: number, now: number): string {
  const minutes = Math.floor(Math.max(0, now - at) / 60_000);
  if (minutes < 1) return "JUST_NOW";
  if (minutes < 60) return `${minutes}M_AGO`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}H_AGO`;
  const days = Math.floor(hours / 24);
  return days === 1 ? "YESTERDAY" : `${days}_DAYS_AGO`;
}

function readinessStatus(overall: number): string {
  if (overall >= 60) return "ON_TRACK";
  if (overall < 40) return "BEHIND";
  return "IN_PROGRESS";
}

function meanPct(values: number[]): number {
  if (values.length === 0) return 0;
  return Math.round(values.reduce((sum, v) => sum + v, 0) / values.length);
}

// Books only ever peeked at (via the Lightbox) sit at lastPage 0 and must not
// be offered as a resume target; only actively-read books qualify.
function mostRecentSlug(reading: ReadingState): string | null {
  const entries = Object.entries(reading.books).filter(([, p]) => p.lastPage > 0);
  if (entries.length === 0) return null;
  return entries.reduce((best, cur) => (cur[1].updatedAt > best[1].updatedAt ? cur : best))[0];
}

function WeakAreasLine({ weakTopics }: { weakTopics: string[] }) {
  if (weakTopics.length === 0) {
    return (
      <p className="mt-2 text-base font-medium text-muted">
        No weak areas tracked yet. <Link to="/quiz" className="text-cy">Take the quiz</Link> to build
        your mastery profile.
      </p>
    );
  }
  return (
    <p className="mt-2 text-base font-medium text-muted">
      PRIORITY TARGETS:{" "}
      {weakTopics.map((topic, i) => (
        <span key={topic}>
          {i > 0 && ", "}
          <span className="text-rd">{topic.toUpperCase()}</span>
        </span>
      ))}
    </p>
  );
}

function StatRow({ label, valueLabel, value, color }: {
  label: string; valueLabel: string; value: number; color: BarColor;
}) {
  return (
    <div>
      <div className="flex items-center justify-between text-sm font-semibold tracking-wide">
        <span className="uppercase text-muted">{label}</span>
        <span className="font-mono text-xs text-fg">{valueLabel}</span>
      </div>
      <Bar value={value} color={color} height={5} className="mt-1" />
    </div>
  );
}

function ReadinessPanel({ overall, booksReadPct, masteryPct, labsDone, labsTotal, labsPct, healthOk }: {
  overall: number; booksReadPct: number; masteryPct: number; labsDone: number; labsTotal: number;
  labsPct: number; healthOk: boolean;
}) {
  return (
    <Panel bracket="cy-tl" className="col-span-4 p-5">
      <MonoLabel className="mb-4 block tracking-[0.18em]">// EXAM_READINESS</MonoLabel>
      <div className="mb-4 text-center">
        <div className="font-mono text-[58px] leading-none text-cy"
             style={{ textShadow: "0 0 24px rgba(0,229,255,0.4)" }}>
          {overall}<span className="text-[26px]">%</span>
        </div>
        <MonoLabel className="mt-2 block tracking-[0.2em]">STATUS: {readinessStatus(overall)}</MonoLabel>
      </div>
      <div className="flex flex-col gap-2.5">
        <StatRow label="Books read" valueLabel={`${booksReadPct}/100`} value={booksReadPct} color="cy" />
        <StatRow label="Quiz mastery" valueLabel={`${masteryPct}/100`} value={masteryPct} color="cy" />
        <StatRow label="Labs done" valueLabel={`${labsDone}/${labsTotal}`} value={labsPct} color="yl" />
        <StatRow label="Index built" valueLabel={healthOk ? "OK" : "FAIL"}
                 value={healthOk ? 100 : 0} color={healthOk ? "gn" : "rd"} />
      </div>
    </Panel>
  );
}

function RecentAccessRows({ recent, now }: { recent: RecentEntry[]; now: number }) {
  const items = recent.slice(0, 3);
  if (items.length === 0) {
    return <MonoLabel className="px-2 text-[10px]">NO RECENT ACCESS</MonoLabel>;
  }
  return (
    <div className="flex flex-col">
      {items.map((r) => (
        <div key={`${r.slug}-${r.page}-${r.at}`}
             className="flex items-center gap-3 px-2 py-1.5 transition-colors duration-120 hover:bg-panel-2">
          <CitationChip label={r.label} slug={r.slug} page={r.page} text={`${r.label} p.${r.page}`} />
          <span className="flex-1 truncate text-[15px] font-medium">{r.title ?? r.label}</span>
          <MonoLabel className="shrink-0 text-[10px]">{relativeTime(r.at, now)}</MonoLabel>
        </div>
      ))}
    </div>
  );
}

function ResumePanel({ reading, booksWithPct, recent, now }: {
  reading: ReadingState; booksWithPct: BookPct[]; recent: RecentEntry[]; now: number;
}) {
  const slug = mostRecentSlug(reading);
  const entry = slug ? booksWithPct.find((b) => b.book.slug === slug) : undefined;
  const progress = slug ? reading.books[slug] : undefined;
  const lastSync = progress ? relativeTime(progress.updatedAt, now) : "NONE";

  return (
    <Panel bracket="yl-br" className="col-span-8 p-5">
      <div className="mb-3.5 flex items-center justify-between">
        <MonoLabel className="tracking-[0.18em]">// RESUME_SESSION</MonoLabel>
        <MonoLabel className="text-[10px]">LAST_SYNC: {lastSync}</MonoLabel>
      </div>
      {entry && progress ? (
        <div className="mb-3.5 flex items-center gap-4 border border-edge-2 bg-panel-2 p-3.5">
          <div className="chamfer-lg flex h-16 w-[50px] shrink-0 items-end justify-center pb-1.5"
               style={{ background: "linear-gradient(180deg,#00e5ff,#0077aa)" }}>
            <span className="font-mono text-[10px] text-black">{bookCode(entry.book.slug)}</span>
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[19px] font-bold uppercase tracking-[0.03em]">
              {entry.book.label}
            </div>
            <MonoLabel className="mt-1 block text-[11px] text-muted">
              P.{progress.lastPage}/{entry.book.pages}
            </MonoLabel>
            <Bar value={entry.pct} color="cy" height={5} className="mt-2" />
          </div>
          <Link to={`/books/${entry.book.slug}?p=${progress.lastPage}`} className={`${btnPrimary} shrink-0`}>
            RESUME ▸
          </Link>
        </div>
      ) : (
        <Link to="/books"
              className="mb-3.5 flex w-full items-center justify-center border border-edge-2
                         bg-panel-2 py-6 text-sm font-bold uppercase tracking-wider text-cy
                         transition-colors duration-120 hover:border-cy hover:bg-cy-dim">
          START READING ▸
        </Link>
      )}
      <MonoLabel className="mb-2 block tracking-[0.18em]">// RECENT_ACCESS</MonoLabel>
      <RecentAccessRows recent={recent} now={now} />
    </Panel>
  );
}

function ReadingProgressPanel({ booksWithPct }: { booksWithPct: BookPct[] }) {
  const inProgress = booksWithPct.filter(({ pct }) => pct > 0 && pct < 100).length;
  return (
    <Panel className="col-span-7 p-5">
      <div className="mb-4 flex items-center justify-between">
        <MonoLabel className="tracking-[0.18em]">// READING_PROGRESS</MonoLabel>
        <MonoLabel className="text-[10px]">{inProgress}/{booksWithPct.length} IN_PROGRESS</MonoLabel>
      </div>
      <div className="flex flex-col gap-3">
        {booksWithPct.map(({ book, pct }) => {
          const done = pct >= 100;
          return (
            <Link key={book.slug} to={`/books/${book.slug}`} className="flex items-center gap-3">
              <span className="mono-label w-[62px] shrink-0 text-[11px] text-faint">
                {bookCode(book.slug)}
              </span>
              <span className="w-[195px] shrink-0 truncate text-[15px] font-medium text-muted">
                {book.label}
              </span>
              <Bar value={pct} color={done ? "gn" : "cy"} height={8} className="flex-1" />
              <span className={`mono-label w-12 shrink-0 text-right text-[11px] ${
                done ? "text-gn" : "text-fg"}`}>
                {done ? "DONE" : `${Math.round(pct)}%`}
              </span>
            </Link>
          );
        })}
      </div>
    </Panel>
  );
}

function MasteryPanel({ mastery, topicOrder }: { mastery: MasteryState; topicOrder: string[] }) {
  const rows = topicOrder
    .map((topic) => ({ topic, value: topicMastery(mastery, topic) }))
    .filter((r): r is { topic: string; value: number } => r.value !== null)
    .sort((a, b) => b.value - a.value);

  return (
    <Panel bracket="rd-tr" className="col-span-5 p-5">
      <div className="mb-4 flex items-center justify-between">
        <MonoLabel className="tracking-[0.18em]">// QUIZ_MASTERY</MonoLabel>
        <Link to="/quiz" className="mono-label text-[10px] text-cy">DRILL_WEAKEST ▸</Link>
      </div>
      {rows.length > 0 ? (
        <div className="flex flex-col gap-2.5">
          {rows.map(({ topic, value }) => {
            const weak = value < 50;
            return (
              <div key={topic}>
                <div className="mb-1 flex items-center justify-between text-sm font-semibold tracking-wide">
                  <span className="uppercase text-muted">{topic}</span>
                  <span className={`font-mono text-xs ${weak ? "text-rd" : "text-cy"}`}>
                    {Math.round(value)}%{weak ? " ⚠" : ""}
                  </span>
                </div>
                <Bar value={value} color={weak ? "rd" : "cy"} height={5} />
              </div>
            );
          })}
        </div>
      ) : (
        <Link to="/quiz" className="mono-label text-[10px] text-faint hover:text-cy">
          NO SIM DATA - RUN THE QUIZ
        </Link>
      )}
    </Panel>
  );
}

const QUICK_ACTIONS = [
  { tag: "//QUERY", title: "Ask the course", desc: "Grounded answers with page citations", to: "/ask" },
  { tag: "//INTEL", title: "Frameworks", desc: "Review key frameworks", to: "/frameworks" },
  { tag: "//REGISTRY", title: "Slide index", desc: "Every slide title, one click to the page", to: "/slides" },
  { tag: "//FIELD_OPS", title: "Labs", desc: "Write-ups and comparisons per book", to: "/labs" },
] as const;

function QuickActions() {
  const { entries } = useStore(examIndexStore);
  const actions = [
    ...QUICK_ACTIONS,
    { tag: "//OPEN_BOOK", title: "Exam index",
      desc: `${entries.length} ${entries.length === 1 ? "entry" : "entries"} toward your printed index`,
      to: "/index" },
  ];
  return (
    <div className="col-span-12 grid grid-cols-5 gap-3.5">
      {actions.map((q) => (
        <Link key={q.to} to={q.to}
              className="border border-edge bg-panel p-4 transition-colors duration-120 hover:border-cy">
          <div className="mono-label mb-2 text-[9px] tracking-[0.2em] text-yl">{q.tag}</div>
          <div className="text-lg font-bold uppercase tracking-[0.03em]">{q.title}</div>
          <div className="mt-1 text-sm font-medium text-muted">{q.desc}</div>
        </Link>
      ))}
    </div>
  );
}

export function Dashboard() {
  const { overall, books, mastery: masteryPct, labs: labsPct, labsDone, labsTotal } = useReadiness();
  const reading = useStore(readingStore);
  const recent = useStore(recentStore);
  const mastery = useStore(masteryStore);
  const { data: health } = useFetch<{ ok: boolean }>("/api/health");
  const topics = useTopics();
  const now = Date.now();

  if (!topics) return null;

  const booksWithPct: BookPct[] = books.map((book) => (
    { book, pct: bookPct(reading, book.slug, book.pages) }
  ));
  const booksReadPct = meanPct(booksWithPct.map((b) => b.pct));
  const weakTopics = topics.order.filter((topic) => isWeak(mastery, topic));

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <Eyebrow className="mb-2">OPERATIVE DASHBOARD</Eyebrow>
          <h1 className="text-[38px] font-bold uppercase leading-none tracking-[0.02em]"
              style={{ textShadow: "2px 0 #ff2e55, -2px 0 #00e5ff" }}>
            WELCOME BACK, OPERATOR_
          </h1>
          <WeakAreasLine weakTopics={weakTopics} />
        </div>
        <div className="flex gap-3">
          <Link to="/quiz" className={btnSecondary}>DRILL WEAK AREAS</Link>
          <Link to="/ask" className={btnPrimary}>ASK THE COURSE</Link>
        </div>
      </div>

      <div className="grid grid-cols-12 gap-3.5">
        <ReadinessPanel overall={overall} booksReadPct={booksReadPct} masteryPct={masteryPct}
                        labsDone={labsDone} labsTotal={labsTotal} labsPct={labsPct}
                        healthOk={health?.ok === true} />
        <ResumePanel reading={reading} booksWithPct={booksWithPct} recent={recent.items} now={now} />
        <ReadingProgressPanel booksWithPct={booksWithPct} />
        <MasteryPanel mastery={mastery} topicOrder={topics.order} />
        <QuickActions />
      </div>
    </div>
  );
}
