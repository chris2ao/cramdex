import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Notes } from "./Notes";

const NOTES = { items: [
  { title: "Demo overview", path: "notes/demo-overview.md" },
  { title: "Field cheatsheet", path: "notes/field-cheatsheet.md" },
]};

function stubNotes(notes: { items: { title: string; path: string }[] } = NOTES) {
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    const u = String(url);
    if (u.includes("/api/content/notes")) return { ok: true, json: async () => notes };
    const m = /path=([^&]+)/.exec(u);
    const path = m ? decodeURIComponent(m[1]) : "";
    return { ok: true, json: async () => ({ markdown: `# Doc\n\nBody for ${path}` }) };
  }) as any);
}

beforeEach(() => { stubNotes(); });
afterEach(() => { vi.unstubAllGlobals(); });

test("renders the first note's markdown body by default", async () => {
  render(<Notes />);
  expect(
    await screen.findByText(/Body for notes\/demo-overview\.md/)
  ).toBeInTheDocument();
});

test("shows a pill per note fetched from the course pack", async () => {
  render(<Notes />);
  await screen.findByText(/demo-overview/);
  for (const name of [/Demo_overview/i, /Field_cheatsheet/i]) {
    expect(screen.getByRole("button", { name })).toBeInTheDocument();
  }
});

test("clicking a note switcher pill fetches that document", async () => {
  render(<Notes />);
  await screen.findByText(/demo-overview/);
  await userEvent.click(screen.getByRole("button", { name: /Field_cheatsheet/i }));
  expect(
    await screen.findByText(/Body for notes\/field-cheatsheet\.md/)
  ).toBeInTheDocument();
});

test("shows the empty state when the course pack has no notes", async () => {
  stubNotes({ items: [] });
  render(<Notes />);
  expect(
    await screen.findByText(
      "No notes in this course pack yet. Add markdown files to the pack's notes/ folder."
    )
  ).toBeInTheDocument();
});
