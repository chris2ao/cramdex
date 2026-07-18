import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { LightboxProvider } from "../components/Lightbox";
import { resetCourseCache } from "../lib/course";
import { SlideIndex } from "./SlideIndex";

const COURSE = { name: "Demo Course", exam_date: null, books: [
  { slug: "book2", label: "Book 2" }, { slug: "book3", label: "Book 3" },
]};

beforeEach(() => {
  resetCourseCache();
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    if (url.includes("/api/course")) return { ok: true, json: async () => COURSE };
    return {
      ok: true,
      json: async () => ({ items: [
        { title: "Ops Tempo", book: "Book 2", page: 74 },
        { title: "Meteor Drill Scenario", book: "Book 3", page: 82 },
      ]}),
    };
  }) as any);
});

function renderPage() {
  render(<MemoryRouter><LightboxProvider><SlideIndex /></LightboxProvider></MemoryRouter>);
}

test("rows are keyboard-activatable and open the lightbox", async () => {
  renderPage();
  const rowButton = await screen.findByRole("button", { name: "Ops Tempo" });
  rowButton.focus();
  await userEvent.keyboard("{Enter}");
  expect(screen.getByRole("img", { name: /Book 2 page 74/ })).toBeInTheDocument();
});

test("clicking a row opens the lightbox at that page", async () => {
  renderPage();
  await userEvent.click(await screen.findByRole("button", { name: "Meteor Drill Scenario" }));
  expect(screen.getByRole("img", { name: /Book 3 page 82/ })).toBeInTheDocument();
});

test("filtering by title narrows the rows", async () => {
  renderPage();
  await screen.findByRole("button", { name: "Ops Tempo" });
  await userEvent.type(screen.getByLabelText("Filter slide titles"), "meteor");
  expect(screen.queryByRole("button", { name: "Ops Tempo" })).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Meteor Drill Scenario" })).toBeInTheDocument();
});

test("the book select filters rows to one book", async () => {
  renderPage();
  await screen.findByRole("button", { name: "Ops Tempo" });
  await userEvent.selectOptions(screen.getByLabelText("Filter by book"), "Book 3");
  expect(screen.queryByRole("button", { name: "Ops Tempo" })).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Meteor Drill Scenario" })).toBeInTheDocument();
});
