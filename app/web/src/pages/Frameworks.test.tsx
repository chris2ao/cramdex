import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { LightboxProvider } from "../components/Lightbox";
import { resetCourseCache } from "../lib/course";
import { Frameworks } from "./Frameworks";

const COURSE = { name: "Demo Course", exam_date: null, books: [
  { slug: "book1", label: "Book 1" }, { slug: "book2", label: "Book 2" },
]};

function mockItems(items: { title: string; body: string }[]) {
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    if (url.includes("/api/course")) return { ok: true, json: async () => COURSE };
    return { ok: true, json: async () => ({ items }) };
  }) as any);
}

beforeEach(() => {
  resetCourseCache();
  mockItems([
    { title: "Demo Cycle — incident-handling lifecycle", body: "Lifecycle. See: Book 1 p.70" },
    { title: "Beta Method — operating cadence", body: "The cadence. See: Book 2 p.74" },
  ]);
});

function renderPage() {
  render(<MemoryRouter><LightboxProvider><Frameworks /></LightboxProvider></MemoryRouter>);
}

test("first framework card is expanded by default and shows its derived system-id", async () => {
  renderPage();
  expect(await screen.findByText(/Lifecycle\./)).toBeInTheDocument();
  expect(screen.getByText("INCIDENT_HANDLING_LIFECYCLE")).toBeInTheDocument();
  // the second card stays collapsed
  expect(screen.queryByText(/The cadence\./)).not.toBeInTheDocument();
});

test("clicking a citation chip in the expanded card opens the lightbox without collapsing the card", async () => {
  renderPage();
  const chip = await screen.findByRole("button", { name: /Book 1 p\.70/ });
  await userEvent.click(chip);
  expect(screen.getByRole("img", { name: /Book 1 page 70/ })).toBeInTheDocument();
  expect(screen.getByText(/Lifecycle\./)).toBeInTheDocument(); // card still expanded
});

test("the toggle collapses the open card and expands another", async () => {
  renderPage();
  // collapse the default-open Demo Cycle card (its accessible name is the short name)
  await userEvent.click(await screen.findByRole("button", { name: "Demo Cycle" }));
  expect(screen.queryByText(/Lifecycle\./)).not.toBeInTheDocument();

  // expanding Beta Method reveals its body
  await userEvent.click(screen.getByRole("button", { name: "Beta Method" }));
  expect(await screen.findByText(/The cadence\./)).toBeInTheDocument();
});
