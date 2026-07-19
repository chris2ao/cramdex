import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { resetCourseCache } from "../lib/course";
import { ReferencePrint } from "./ReferencePrint";

const TERMS = [
  { term: "Demo Cycle", definition: "Six-phase lifecycle.", see: "Book 1 p.3" },
];
const ACROS = [
  { acronym: "LBIR", expansion: "Lunar Base Incident Response", book: "Book 1", printed_page: 1 },
];
const FRAMEWORKS = [
  { title: "Meteor Drill Scenario", body: "Tabletop exercise." },
];
const COURSE = { name: "Demo Course", exam_date: null, books: [
  { slug: "book1", label: "Book 1" },
]};

function mockData(terms = TERMS, acros = ACROS, frameworks = FRAMEWORKS) {
  vi.stubGlobal("fetch", vi.fn(async (path: string) => {
    const url = String(path);
    if (url.includes("/api/course")) return { ok: true, json: async () => COURSE };
    if (url.includes("/api/content/acronyms")) return { ok: true, json: async () => ({ items: acros }) };
    if (url.includes("/api/content/frameworks")) return { ok: true, json: async () => ({ items: frameworks }) };
    return { ok: true, json: async () => ({ items: terms }) };
  }) as any);
}

beforeEach(() => {
  resetCourseCache();
  mockData();
});

function renderPage() {
  render(<MemoryRouter><ReferencePrint /></MemoryRouter>);
}

test("renders all three sections with fetched content", async () => {
  renderPage();
  expect(await screen.findByTestId("ref-glossary")).toHaveTextContent("Demo Cycle");
  expect(screen.getByTestId("ref-acronyms")).toHaveTextContent("LBIR");
  expect(screen.getByTestId("ref-frameworks")).toHaveTextContent("Meteor Drill Scenario");
});

test("section toggles remove sections", async () => {
  renderPage();
  await screen.findByTestId("ref-frameworks");

  await userEvent.click(screen.getByRole("checkbox", { name: "FRAMEWORKS" }));

  expect(screen.queryByTestId("ref-frameworks")).toBeNull();
});

test("renders fetch errors for individual sections when they fail", async () => {
  vi.stubGlobal("fetch", vi.fn(async (path: string) => {
    const url = String(path);
    if (url.includes("/api/course")) return { ok: true, json: async () => COURSE };
    if (url.includes("/api/content/acronyms")) return { ok: true, json: async () => ({ items: ACROS }) };
    if (url.includes("/api/content/frameworks")) {
      return { ok: false, statusText: "Server Error", json: async () => { throw new Error("Server Error"); } };
    }
    return { ok: true, json: async () => ({ items: TERMS }) };
  }) as any);

  renderPage();

  // glossary and acronyms should render normally
  expect(await screen.findByTestId("ref-glossary")).toHaveTextContent("Demo Cycle");
  expect(screen.getByTestId("ref-acronyms")).toHaveTextContent("LBIR");

  // frameworks error should be visible in ref-frameworks section
  expect(screen.getByTestId("ref-frameworks")).toHaveTextContent(/error/i);
});
