import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { LightboxProvider } from "../components/Lightbox";
import { labsStore } from "../stores/labs";
import { Labs } from "./Labs";

const LAB = {
  id: "lab-3.4", title: "Lab 3.4 - Notification",
  writeup: "labs/book3/lab-3.4.md", comparison: null,
  csvs: ["labs/book3/lab-3.4-actions.csv"],
};

function stubLabs(labs: unknown[]) {
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    if (url.includes("/api/content/labs")) {
      return { ok: true, json: async () => ({ items: [{ book: "book3", labs }] }) };
    }
    return { ok: true, json: async () => ({ markdown: "# doc" }) };
  }) as any);
}

function renderLabs() {
  return render(<MemoryRouter><LightboxProvider><Labs /></LightboxProvider></MemoryRouter>);
}

beforeEach(() => {
  window.localStorage.clear();
  labsStore.set(() => ({ overrides: {} }));
});

afterEach(() => { vi.unstubAllGlobals(); });

test("a failing CSV fetch surfaces an error instead of silence", async () => {
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    if (url.includes("/api/content/labs")) {
      return { ok: true, json: async () => ({ items: [{ book: "book3", labs: [LAB] }] }) };
    }
    if (url.includes("/api/content/doc")) {
      return { ok: true, json: async () => ({ path: LAB.writeup, markdown: "# Lab 3.4" }) };
    }
    return { ok: false, statusText: "Bad Request", json: async () => ({ detail: "Path not allowed" }) };
  }) as any);

  renderLabs();
  await userEvent.click(await screen.findByRole("button", { name: /Lab 3\.4/ }));
  expect(await screen.findByText(/Path not allowed/)).toBeInTheDocument();
});

test("status badge reads DONE when a comparison exists, OPEN when not", async () => {
  stubLabs([
    { id: "lab-a", title: "Lab A", writeup: "w", comparison: "c", csvs: [] },
    { id: "lab-b", title: "Lab B", writeup: "w", comparison: null, csvs: [] },
  ]);
  renderLabs();
  expect(await screen.findByRole("button", { name: "DONE" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "OPEN" })).toBeInTheDocument();
});

test("the per-book group eyebrow is the derived book code", async () => {
  stubLabs([{ id: "lab-b", title: "Lab B", writeup: "w", comparison: null, csvs: [] }]);
  renderLabs();
  expect(await screen.findByText(/BOOK_3/)).toBeInTheDocument();
});

test("clicking the badge toggles done state via the labs store, without opening the lab", async () => {
  stubLabs([{ id: "lab-b", title: "Lab B", writeup: "w", comparison: null, csvs: [] }]);
  renderLabs();
  const badge = await screen.findByRole("button", { name: "OPEN" });
  await userEvent.click(badge);

  expect(labsStore.get().overrides["lab-b"]).toBe(true);
  // Still in the list view (a badge, not the detail view) and now shows DONE.
  expect(await screen.findByRole("button", { name: "DONE" })).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: /^labs$/i })).toBeInTheDocument();
});
