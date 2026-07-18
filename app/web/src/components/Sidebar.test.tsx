import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { settingsStore, setExamDate } from "../stores/settings";
import { examIndexStore } from "../stores/examIndex";
import { resetCourseCache } from "../lib/course";
import { Sidebar } from "./Sidebar";

const BOOKS_RESPONSE = { items: [] };
const LABS_RESPONSE = { items: [] };
const TOPICS_RESPONSE = { promoted: [], themes: {}, fallback: "General", order: [] };
const DECK_RESPONSE = { items: [] };

type CourseListItem = { slug: string; name: string | null; active: boolean; valid: boolean };
type ActivateResult = { ok: boolean; status?: number; json: () => Promise<unknown> };

function stubFetch(
  course: { name: string; exam_date: string | null; books: unknown[] },
  opts: { courses?: CourseListItem[]; activate?: (slug: string) => ActivateResult } = {},
) {
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.startsWith("/api/course/activate")) {
      const slug = init?.body ? JSON.parse(String(init.body)).slug : undefined;
      if (opts.activate) return opts.activate(slug);
      return { ok: true, json: async () => ({ items: opts.courses ?? [] }) };
    }
    if (url.startsWith("/api/courses")) {
      return { ok: true, json: async () => ({ items: opts.courses ?? [] }) };
    }
    if (url.startsWith("/api/course")) return { ok: true, json: async () => course };
    if (url.startsWith("/api/content/books")) return { ok: true, json: async () => BOOKS_RESPONSE };
    if (url.startsWith("/api/content/labs")) return { ok: true, json: async () => LABS_RESPONSE };
    if (url.startsWith("/api/content/topics")) return { ok: true, json: async () => TOPICS_RESPONSE };
    if (url.startsWith("/api/quiz/deck")) return { ok: true, json: async () => DECK_RESPONSE };
    return { ok: true, json: async () => ({}) };
  }) as any);
}

function renderSidebar() {
  return render(<MemoryRouter><Sidebar /></MemoryRouter>);
}

// Replaces window.location with a copy whose reload is a spy, so tests can
// assert on it; jsdom's real location.reload() is not implemented.
function stubReload(): ReturnType<typeof vi.fn> {
  const reload = vi.fn();
  Object.defineProperty(window, "location", {
    configurable: true,
    value: { ...window.location, reload },
  });
  return reload;
}

const DEMO_COURSE = { name: "Demo Course", exam_date: null, books: [] };

let originalLocation: Location;

beforeEach(() => {
  window.localStorage.clear();
  settingsStore.set(() => ({ examDate: null }));
  examIndexStore.set(() => ({ entries: [], dismissed: [] }));
  resetCourseCache();
  originalLocation = window.location;
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  Object.defineProperty(window, "location", { configurable: true, value: originalLocation });
});

test("shows SET_DATE when neither the user nor the course pack has an exam date", async () => {
  stubFetch({ name: "Demo Course", exam_date: null, books: [] });
  renderSidebar();
  expect(await screen.findByRole("button", { name: "SET_DATE" })).toBeInTheDocument();
});

test("falls back to the course pack's exam date without writing it into the settings store", async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2099-03-12T00:00:00.000Z"));
  stubFetch({ name: "Demo Course", exam_date: "2099-03-14T12:30:00.000Z", books: [] });
  renderSidebar();
  expect(await screen.findByRole("button", { name: /2d/ })).toBeInTheDocument();
  expect(settingsStore.get().examDate).toBeNull();
});

test("prefers a user-chosen exam date over the course pack's", async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-14T00:00:00.000Z"));
  setExamDate("2026-11-01T00:00:00.000Z");
  stubFetch({ name: "Demo Course", exam_date: "2099-03-14T12:30:00.000Z", books: [] });
  renderSidebar();
  expect(await screen.findByRole("button", { name: /18d/ })).toBeInTheDocument();
});

test("hides the course switcher when fewer than 2 valid packs exist", async () => {
  stubFetch(DEMO_COURSE, { courses: [
    { slug: "alpha", name: "Alpha", active: true, valid: true },
    { slug: "beta", name: null, active: false, valid: false },
  ] });
  renderSidebar();
  await screen.findByRole("button", { name: "SET_DATE" }); // wait for initial render to settle
  expect(screen.queryByRole("combobox", { name: /course/i })).not.toBeInTheDocument();
});

test("hides the course switcher when the course list is empty", async () => {
  stubFetch(DEMO_COURSE, { courses: [] });
  renderSidebar();
  await screen.findByRole("button", { name: "SET_DATE" });
  expect(screen.queryByRole("combobox", { name: /course/i })).not.toBeInTheDocument();
});

test("shows the course switcher with the active pack selected once 2+ valid packs exist", async () => {
  stubFetch(DEMO_COURSE, { courses: [
    { slug: "alpha", name: "Alpha Course", active: false, valid: true },
    { slug: "beta", name: "Beta Course", active: true, valid: true },
  ] });
  renderSidebar();
  const select = await screen.findByRole("combobox", { name: /course/i });
  expect(select).toHaveValue("beta");
  expect(screen.getByRole("option", { name: "Alpha Course" })).toBeInTheDocument();
  expect(screen.getByRole("option", { name: "Beta Course" })).toBeInTheDocument();
});

test("shows invalid packs as disabled options suffixed with (invalid)", async () => {
  stubFetch(DEMO_COURSE, { courses: [
    { slug: "alpha", name: "Alpha Course", active: true, valid: true },
    { slug: "beta", name: "Beta Course", active: false, valid: true },
    { slug: "ghost", name: null, active: false, valid: false },
  ] });
  renderSidebar();
  await screen.findByRole("combobox", { name: /course/i });
  const invalidOption = screen.getByRole("option", { name: "ghost (invalid)" });
  expect(invalidOption).toBeDisabled();
});

test("changing the course select activates it then reloads the page", async () => {
  const reload = stubReload();
  const courses = [
    { slug: "alpha", name: "Alpha Course", active: true, valid: true },
    { slug: "beta", name: "Beta Course", active: false, valid: true },
  ];
  const activate = vi.fn((slug: string) => ({
    ok: true, json: async () => ({ items: courses.map((c) => ({ ...c, active: c.slug === slug })) }),
  }));
  stubFetch(DEMO_COURSE, { courses, activate });
  renderSidebar();
  const select = await screen.findByRole("combobox", { name: /course/i });

  await userEvent.selectOptions(select, "beta");

  await waitFor(() => expect(activate).toHaveBeenCalledWith("beta"));
  await waitFor(() => expect(reload).toHaveBeenCalledTimes(1));
});

test("an activation failure shows an inline error and does not reload", async () => {
  const reload = stubReload();
  const courses = [
    { slug: "alpha", name: "Alpha Course", active: true, valid: true },
    { slug: "beta", name: "Beta Course", active: false, valid: true },
  ];
  stubFetch(DEMO_COURSE, {
    courses,
    activate: () => ({ ok: false, status: 503, json: async () => ({ detail: "Pack config is broken." }) }),
  });
  renderSidebar();
  const select = await screen.findByRole("combobox", { name: /course/i });

  await userEvent.selectOptions(select, "beta");

  expect(await screen.findByText("Pack config is broken.")).toBeInTheDocument();
  expect(reload).not.toHaveBeenCalled();
});

test("shows the index nav badge with the entry count when the store has entries", async () => {
  examIndexStore.set(() => ({
    dismissed: [],
    entries: [
      { id: "a", term: "Dust Lock", definition: "", topic: "", at: 1,
        citations: [{ slug: "book1", label: "Book 1", page: 2 }] },
      { id: "b", term: "Ops Tempo", definition: "", topic: "", at: 2,
        citations: [{ slug: "book1", label: "Book 1", page: 4 }] },
    ],
  }));
  stubFetch(DEMO_COURSE);
  renderSidebar();
  await screen.findByRole("button", { name: "SET_DATE" }); // wait for initial render to settle
  expect(screen.getByRole("link", { name: /^Index\s*\[2\]$/ })).toBeInTheDocument();
});

test("shows a plain Index label when the exam index store is empty", async () => {
  stubFetch(DEMO_COURSE);
  renderSidebar();
  await screen.findByRole("button", { name: "SET_DATE" }); // wait for initial render to settle
  expect(screen.getByRole("link", { name: "Index" })).toBeInTheDocument();
});
