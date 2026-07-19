import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { LightboxProvider } from "../components/Lightbox";
import { resetCourseCache } from "../lib/course";
import { Glossary } from "./Glossary";

const TERMS = [
  { term: "Ops Tempo", definition: "The cadence of recurring meetings.", see: "Book 2 p.76" },
  { term: "Containment", definition: "Actions that limit spread.", see: "Book 3 p.98" },
];
const ACROS = [
  { acronym: "SITREP", expansion: "Situation report", book: "Book 2", printed_page: 77 },
  { acronym: "IOC", expansion: "Indicator of compromise", book: "Book 2", printed_page: 31 },
];
const COURSE = { name: "Demo Course", exam_date: null, books: [
  { slug: "book2", label: "Book 2" }, { slug: "book3", label: "Book 3" },
]};

function mockData(terms = TERMS, acros = ACROS) {
  vi.stubGlobal("fetch", vi.fn(async (path: string) => {
    const url = String(path);
    if (url.includes("/api/course")) return { ok: true, json: async () => COURSE };
    return { ok: true, json: async () => ({ items: url.includes("acronyms") ? acros : terms }) };
  }) as any);
}

beforeEach(() => {
  resetCourseCache();
  mockData();
});

function renderPage() {
  render(<MemoryRouter><LightboxProvider><Glossary /></LightboxProvider></MemoryRouter>);
}

test("renders curated terms, acronyms, and the acronym count", async () => {
  renderPage();
  expect(await screen.findByText("Ops Tempo")).toBeInTheDocument();
  expect(screen.getByText("Situation report")).toBeInTheDocument();
  expect(screen.getByText("// ACRONYMS [2]")).toBeInTheDocument();
});

test("filtering narrows terms and acronyms and updates the acronym count", async () => {
  renderPage();
  await screen.findByText("Ops Tempo");
  await userEvent.type(screen.getByLabelText("Filter terms and acronyms"), "sitrep");

  expect(screen.queryByText("Ops Tempo")).not.toBeInTheDocument();
  expect(screen.getByText("Situation report")).toBeInTheDocument();
  expect(screen.getByText("// ACRONYMS [1]")).toBeInTheDocument();
});

test("a term citation chip opens the lightbox", async () => {
  renderPage();
  const chip = await screen.findByRole("button", { name: /Book 2 p\.76/ });
  await userEvent.click(chip);
  expect(screen.getByRole("img", { name: /Book 2 page 76/ })).toBeInTheDocument();
});

test("a print view link is offered", () => {
  renderPage();
  expect(screen.getByRole("link", { name: "PRINT VIEW ▸" })).toHaveAttribute(
    "href", "/reference/print");
});
