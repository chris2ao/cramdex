import { useEffect, useState } from "react";
import { NavLink } from "react-router-dom";
import { useFetch } from "../hooks/useFetch";
import { useReadiness } from "../hooks/useReadiness";
import { useStore } from "../stores/useStore";
import { settingsStore, setExamDate, countdownParts } from "../stores/settings";
import { examIndexStore } from "../stores/examIndex";
import { useCourse, fetchCourses, activateCourse } from "../lib/course";
import type { CourseListItem } from "../lib/course";
import { Bar } from "./ui/Bar";
import { MonoLabel } from "./ui/Text";

type Group = { eyebrow: string; items: Array<{ to: string; label: string; badge?: string }> };

function navGroups(deckSize: number | null, indexCount: number): Group[] {
  return [
    { eyebrow: "CORE", items: [
      { to: "/", label: "Dashboard" },
      { to: "/books", label: "Books" },
      { to: "/ask", label: "Ask" },
      { to: "/quiz", label: "Quiz", badge: deckSize ? `[${deckSize}]` : undefined },
      { to: "/index", label: "Index", badge: indexCount ? `[${indexCount}]` : undefined },
    ]},
    { eyebrow: "QUERY", items: [
      { to: "/search", label: "Search" },
      { to: "/slides", label: "Slide Index" },
    ]},
    { eyebrow: "INTEL", items: [
      { to: "/frameworks", label: "Frameworks" },
      { to: "/glossary", label: "Glossary" },
    ]},
    { eyebrow: "ARCHIVE", items: [
      { to: "/notes", label: "Notes" },
      { to: "/labs", label: "Labs" },
      { to: "/bookmarks", label: "Bookmarks" },
      { to: "/assets", label: "Assets" },
    ]},
  ];
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function Countdown() {
  const settings = useStore(settingsStore);
  const course = useCourse();
  const [now, setNow] = useState(() => Date.now());
  const [editing, setEditing] = useState(false);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);
  // Falls back to the active course pack's exam date when the user has not
  // chosen one of their own; the fallback is display-only and never written
  // into the settings store.
  const effectiveExamDate = settings.examDate ?? course?.exam_date ?? null;
  const parts = countdownParts({ examDate: effectiveExamDate }, now);
  return (
    <div className="mt-2 flex items-center justify-between">
      <MonoLabel className="tracking-[0.12em]">EXAM_COUNTDOWN</MonoLabel>
      {editing ? (
        <input
          type="date"
          autoFocus
          defaultValue={settings.examDate ?? ""}
          onBlur={(e) => { setExamDate(e.target.value || null); setEditing(false); }}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
            if (e.key === "Escape") setEditing(false);
          }}
          className="input-hud mono-label w-32 px-1 py-0.5 text-[10px]"
          aria-label="Exam date"
        />
      ) : (
        <button
          onClick={() => setEditing(true)}
          title="Set exam date"
          className="font-mono text-[15px] text-yl hover:text-fg"
        >
          {parts ? `${parts.days}d ${pad(parts.hours)}:${pad(parts.minutes)}` : "SET_DATE"}
        </button>
      )}
    </div>
  );
}

// Course pack switcher. Loads the list fresh on every mount (fetchCourses
// is intentionally not promise-cached), and hides itself entirely unless
// there are 2+ valid packs to switch between; loading/absent states render
// nothing rather than a placeholder.
function CourseSwitcher() {
  const [courses, setCourses] = useState<CourseListItem[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    fetchCourses().then((items) => {
      if (alive) setCourses(items);
    }).catch((err) => {
      console.error("cramdex: failed to load course list", err);
    });
    return () => { alive = false; };
  }, []);

  if (!courses || courses.filter((c) => c.valid).length < 2) return null;

  const active = courses.find((c) => c.active);

  async function handleChange(slug: string) {
    setError("");
    try {
      await activateCourse(slug);
      window.location.reload();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <div className="mb-4">
      <span className="mono-label mb-1.5 block px-2 text-[9px] text-faint">
        {"// COURSE"}
      </span>
      <select
        value={active?.slug ?? ""}
        onChange={(e) => handleChange(e.target.value)}
        aria-label="Active course"
        className="input-hud w-full px-2 py-1.5 font-mono text-[11px] uppercase"
      >
        {courses.map((c) => (
          <option key={c.slug} value={c.slug} disabled={!c.valid}>
            {(c.name ?? c.slug)}{!c.valid ? " (invalid)" : ""}
          </option>
        ))}
      </select>
      {error && (
        <p className="mono-label mt-1.5 px-2 text-[9px] text-rd">{error}</p>
      )}
    </div>
  );
}

function Footer() {
  const { overall } = useReadiness();
  return (
    <div className="mt-[14px] border-t border-edge pt-[14px]">
      <div className="mb-1.5 flex items-center justify-between">
        <MonoLabel className="tracking-[0.12em]">READINESS</MonoLabel>
        <span className="font-mono text-[15px] text-cy">{overall}%</span>
      </div>
      <Bar value={overall} dashed height={6} />
      <Countdown />
    </div>
  );
}

export function Sidebar() {
  const { data: deck } = useFetch<{ items: unknown[] }>("/api/quiz/deck?source=all");
  const indexCount = useStore(examIndexStore).entries.length;
  const groups = navGroups(deck ? deck.items.length : null, indexCount);
  return (
    <nav className="sticky top-0 flex h-screen w-[252px] shrink-0 flex-col
                    overflow-y-auto border-r border-edge bg-panel px-3.5 py-5 print:hidden">
      <div className="relative mb-[18px] border border-edge-2 px-3.5 py-3.5">
        <span aria-hidden className="pointer-events-none absolute -top-px -left-px
                                     h-3 w-3 border-t-2 border-l-2 border-yl" />
        <span aria-hidden className="pointer-events-none absolute -bottom-px -right-px
                                     h-3 w-3 border-b-2 border-r-2 border-yl" />
        <span className="mono-label text-[10px] tracking-[0.15em] text-faint">
          {"//STUDY_OS v1.0"}
        </span>
        <div className="mt-1.5 text-[26px] font-bold leading-none tracking-[0.04em]">
          CRAM<span className="text-yl">DEX</span>
        </div>
        <div className="mono-label text-[10px] tracking-[0.1em] text-cy">
          EXAM PREP TERMINAL
        </div>
      </div>
      <div className="flex-1">
        <CourseSwitcher />
        {groups.map((g) => (
          <div key={g.eyebrow} className="mb-4">
            <span className="mono-label mb-1.5 block px-2 text-[9px] text-faint">
              {"// "}{g.eyebrow}
            </span>
            <ul>
              {g.items.map((item) => (
                <li key={item.to}>
                  <NavLink to={item.to} end={item.to === "/"}>
                    {({ isActive }) => (
                      <span className={`flex items-center justify-between px-2 py-[7px]
                                        text-sm font-semibold uppercase tracking-[0.06em]
                                        transition-colors duration-120 ${
                          isActive ? "bg-yl-dim text-yl"
                                   : "text-muted hover:bg-panel-2 hover:text-fg"}`}>
                        <span className="flex items-center gap-[9px]">
                          <span aria-hidden
                            className={`h-4 w-[3px] ${isActive ? "bg-yl" : "bg-transparent"}`} />
                          {item.label}
                        </span>
                        {item.badge && (
                          <span className="mono-label text-[10px] text-yl">{item.badge}</span>
                        )}
                      </span>
                    )}
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <Footer />
    </nav>
  );
}
