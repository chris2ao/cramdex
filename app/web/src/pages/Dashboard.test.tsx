import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { LightboxProvider } from "../components/Lightbox";
import { readingStore, recordPageView } from "../stores/reading";
import { recentStore, pushRecent } from "../stores/recent";
import { masteryStore, recordGrade } from "../stores/mastery";
import { labsStore } from "../stores/labs";
import { examIndexStore } from "../stores/examIndex";
import { resetCourseCache } from "../lib/course";
import { Dashboard } from "./Dashboard";

const BOOKS_RESPONSE = { items: [
  { slug: "book1", label: "Book 1", pages: 158 },
  { slug: "book2", label: "Book 2", pages: 148 },
  { slug: "book3", label: "Book 3", pages: 114 },
  { slug: "book4", label: "Book 4", pages: 128 },
  { slug: "book5", label: "Book 5", pages: 117 },
  { slug: "bookB", label: "Book B", pages: 21 },
  { slug: "workbook", label: "Workbook", pages: 237 },
]};

const LABS_RESPONSE = { items: [
  { book: "Book 3", labs: [
    { id: "lab-3.1", comparison: "solution text" },
    { id: "lab-3.2", comparison: null },
  ]},
  { book: "Book 4", labs: [
    { id: "lab-4.1", comparison: "solution text" },
  ]},
]};

const HEALTH_RESPONSE = { ok: true };

// Demo Cycle and Beta Method are the mastery topics the tests below record
// grades against; the fictional filler topics stay unattempted so the
// readiness blend below (11-topic mean) matches the original computation
// exactly. Promoted keys are the normalized (uppercased) form of the card
// front; labels are the display form used everywhere else.
const TOPICS_RESPONSE = {
  promoted: [
    { key: "DEMO CYCLE", label: "Demo Cycle" },
    { key: "BETA METHOD", label: "Beta Method" },
  ],
  themes: {},
  fallback: "General",
  order: [
    "Demo Cycle", "Beta Method", "Topic 3", "Topic 4", "Topic 5", "Topic 6",
    "Topic 7", "Topic 8", "Topic 9", "Topic 10", "General",
  ],
};

function jsonResponse(body: unknown) {
  return { ok: true, json: async () => body };
}

function stubFetch() {
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.startsWith("/api/content/books")) return jsonResponse(BOOKS_RESPONSE);
    if (url.startsWith("/api/content/labs")) return jsonResponse(LABS_RESPONSE);
    if (url.startsWith("/api/content/topics")) return jsonResponse(TOPICS_RESPONSE);
    if (url.startsWith("/api/health")) return jsonResponse(HEALTH_RESPONSE);
    return jsonResponse({});
  }) as any);
}

function renderDashboard() {
  return render(<MemoryRouter><LightboxProvider><Dashboard /></LightboxProvider></MemoryRouter>);
}

beforeEach(() => {
  window.localStorage.clear();
  readingStore.set(() => ({ books: {} }));
  recentStore.set(() => ({ items: [] }));
  masteryStore.set(() => ({ topics: {} }));
  labsStore.set(() => ({ overrides: {} }));
  examIndexStore.set(() => ({ entries: [], dismissed: [] }));
  resetCourseCache();
  stubFetch();
});

test("exam readiness stats match computeReadiness for seeded store data", async () => {
  // book1: 79 distinct pages viewed / 158 = 50%; other 6 books untouched (0%)
  // -> books mean = 7 (rounded). The last call in the loop also sets lastPage.
  for (let p = 1; p <= 79; p++) recordPageView("book1", p);
  // Demo Cycle: 3 got, 1 missed = 75%; Beta Method: 1 got, 3 missed = 25% (weak)
  recordGrade("Demo Cycle", true);
  recordGrade("Demo Cycle", true);
  recordGrade("Demo Cycle", true);
  recordGrade("Demo Cycle", false);
  recordGrade("Beta Method", true);
  recordGrade("Beta Method", false);
  recordGrade("Beta Method", false);
  recordGrade("Beta Method", false);
  // labs: 2 of 3 done by default (comparison != null), no manual overrides

  const { container } = renderDashboard();

  // overall = round(0.4*7.14 + 0.4*9.09 + 0.2*66.67) = 20
  expect(await screen.findByText("20")).toBeInTheDocument();
  expect(screen.getByText("STATUS: BEHIND")).toBeInTheDocument();
  expect(screen.getByText("7/100")).toBeInTheDocument();
  expect(screen.getByText("9/100")).toBeInTheDocument();
  expect(screen.getByText("2/3")).toBeInTheDocument();
  expect(screen.getByText("OK")).toBeInTheDocument();

  // weak topic named in red in the header subline (rendered via .toUpperCase())
  const redSpans = Array.from(container.querySelectorAll("span.text-rd")).map((el) => el.textContent);
  expect(redSpans).toContain("BETA METHOD");

  // weak topic renders with the warning marker in the mastery panel; the
  // mastered topic does not
  expect(screen.getByText("25% ⚠")).toBeInTheDocument();
  expect(screen.getByText("75%")).toBeInTheDocument();

  // rows sort strongest mastery first (Demo Cycle 75%), weakest last (Beta Method 25%)
  const masteryPanel = screen.getByText("// QUIZ_MASTERY").closest("div.col-span-5");
  const topicOrder = Array.from(masteryPanel!.querySelectorAll("span.uppercase.text-muted"))
    .map((el) => el.textContent);
  expect(topicOrder).toEqual(["Demo Cycle", "Beta Method"]);
});

test("resume session shows the most recently read book and links to its last page", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-07-10T10:00:00Z"));
  recordPageView("book1", 79);
  vi.setSystemTime(new Date("2026-07-15T10:00:00Z"));
  recordPageView("book2", 40);
  vi.setSystemTime(new Date("2026-07-16T09:00:00Z"));
  pushRecent({ slug: "book2", label: "Book 2", page: 40, title: "Ops tempo" });
  vi.useRealTimers();

  renderDashboard();

  const resumeLink = await screen.findByRole("link", { name: /resume/i });
  expect(resumeLink).toHaveAttribute("href", "/books/book2?p=40");
  expect(screen.getByText("P.40/148")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /Book 2 p\.40/ })).toBeInTheDocument();
});

test("renders empty states when there is no reading, mastery, or recent-access data", async () => {
  renderDashboard();

  const startLink = await screen.findByRole("link", { name: /start reading/i });
  expect(startLink).toHaveAttribute("href", "/books");
  expect(screen.getByText("NO RECENT ACCESS")).toBeInTheDocument();
  expect(screen.getByText("LAST_SYNC: NONE")).toBeInTheDocument();

  const quizLink = screen.getByRole("link", { name: /no sim data - run the quiz/i });
  expect(quizLink).toHaveAttribute("href", "/quiz");
  expect(screen.getByText(/take the quiz/i)).toBeInTheDocument();
});

test("the exam index quick action tile shows the seeded entry count", async () => {
  examIndexStore.set(() => ({
    dismissed: [],
    entries: [
      { id: "a", term: "Dust Lock", definition: "", topic: "", at: 1,
        citations: [{ slug: "book1", label: "Book 1", page: 2 }] },
    ],
  }));

  renderDashboard();

  const tile = await screen.findByRole("link", { name: /exam index/i });
  expect(tile).toHaveAttribute("href", "/index");
  expect(screen.getByText("1 entry toward your printed index")).toBeInTheDocument();
});
