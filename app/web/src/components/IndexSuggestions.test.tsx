import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "../stores/testLocalStorage";
import { examIndexStore } from "../stores/examIndex";
import { resetCourseCache } from "../lib/course";
import { resetLlmCache } from "../lib/llm";
import { IndexSuggestions } from "./IndexSuggestions";

const SUGGEST_ITEMS = [
  { term: "Demo Cycle Overview", slug: "book1", label: "Book 1",
    printed_page: 3, kind: "title", hint: "" },
  { term: "LBIR", slug: "book1", label: "Book 1",
    printed_page: 1, kind: "acronym", hint: "Lunar Base Incident Response" },
];

const COURSE = { name: "Demo Course", exam_date: null, books: [
  { slug: "book1", label: "Book 1" }, { slug: "book2", label: "Book 2" },
]};

const LLM_CONFIGURED = {
  name: "anthropic_api", display_name: "Anthropic API",
  configured: true, detail: "key present",
};
const LLM_UNCONFIGURED = {
  name: "claude_cli", display_name: "Claude CLI",
  configured: false, detail: "claude command not found on PATH",
};

// Shared course/llm routing for fetch stubs below; returns undefined for
// URLs the caller must still handle itself (suggest/ai-suggest endpoints).
function baseFetch(url: string): { ok: true; json: () => Promise<unknown> } | undefined {
  if (url.includes("/api/course")) return { ok: true, json: async () => COURSE };
  if (url.includes("/api/llm")) return { ok: true, json: async () => LLM_CONFIGURED };
  return undefined;
}

beforeEach(() => {
  window.localStorage.clear();
  examIndexStore.set(() => ({ entries: [], dismissed: [] }));
  resetCourseCache();
  resetLlmCache();
  vi.stubGlobal("fetch", vi.fn(async (url: string) =>
    baseFetch(url) ??
    (url.includes("/api/index/suggest")
      ? { ok: true, json: async () => ({ items: SUGGEST_ITEMS }) }
      : { ok: false, status: 404, json: async () => ({}) })) as any);
});

test("renders fetched suggestions with kind and citation", async () => {
  render(<IndexSuggestions />);
  expect(await screen.findByText("Demo Cycle Overview")).toBeInTheDocument();
  expect(screen.getByText(/Lunar Base Incident Response/)).toBeInTheDocument();
});

test("suggestions already in the index are hidden", async () => {
  examIndexStore.set(() => ({
    dismissed: [],
    entries: [{ id: "x", term: "demo cycle overview", definition: "", topic: "",
                at: 1, citations: [{ slug: "book1", label: "Book 1", page: 3 }] }],
  }));
  render(<IndexSuggestions />);
  expect(await screen.findByText("LBIR")).toBeInTheDocument();
  expect(screen.queryByText("Demo Cycle Overview")).not.toBeInTheDocument();
});

test("dismiss hides the suggestion and persists the key", async () => {
  render(<IndexSuggestions />);
  await screen.findByText("Demo Cycle Overview");
  await userEvent.click(screen.getAllByRole("button", { name: "[DISMISS]" })[0]);
  expect(screen.queryByText("Demo Cycle Overview")).not.toBeInTheDocument();
  expect(examIndexStore.get().dismissed).toContain("book1:3:demo cycle overview");
});

test("review opens the capture dialog prefilled for explicit approval", async () => {
  render(<IndexSuggestions />);
  await screen.findByText("LBIR");
  await userEvent.click(screen.getAllByRole("button", { name: "[REVIEW ▸]" })[1]);
  const dialog = screen.getByRole("dialog", { name: /add to index/i });
  expect(dialog).toBeInTheDocument();
  expect(screen.getByLabelText("TERM")).toHaveValue("LBIR");
  expect(screen.getByLabelText(/definition/i)).toHaveValue("Lunar Base Incident Response");
});

test("suggest 404 shows the guidance message", async () => {
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    if (url.includes("/api/index/suggest")) {
      return {
        ok: false, status: 404,
        json: async () => ({
          detail: "No extracted term data found. Run scripts/build.sh to extract terms.",
        }),
      };
    }
    return baseFetch(url) ?? { ok: false, status: 404, json: async () => ({}) };
  }) as any);
  render(<IndexSuggestions />);
  expect(await screen.findByText(/run scripts\/build\.sh/i)).toBeInTheDocument();
});

test("AI assist posts the range and lists proposals for review", async () => {
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    if (url.includes("/api/index/ai-suggest")) {
      return {
        ok: true,
        json: async () => ({ items: [
          { term: "Dust Lock", definition: "Containment posture",
            printed_page: 2, slug: "book2", label: "Book 2" },
        ] }),
      };
    }
    if (url.includes("/api/index/suggest")) {
      return { ok: true, json: async () => ({ items: SUGGEST_ITEMS }) };
    }
    return baseFetch(url) ?? { ok: false, status: 404, json: async () => ({}) };
  }) as any);

  render(<IndexSuggestions />);
  await screen.findByText("LBIR");
  await userEvent.selectOptions(screen.getByLabelText(/ai book/i), "book2");
  await userEvent.type(screen.getByLabelText(/first page/i), "1");
  await userEvent.type(screen.getByLabelText(/last page/i), "8");
  await userEvent.click(screen.getByRole("button", { name: /ai suggest/i }));
  expect(await screen.findByText("Dust Lock")).toBeInTheDocument();
  expect(screen.getByText(/Containment posture/)).toBeInTheDocument();
});

test("AI assist rejects blank page inputs without calling the API", async () => {
  const fetchMock = vi.fn(async (url: string) =>
    baseFetch(url) ??
    (url.includes("/api/index/suggest")
      ? { ok: true, json: async () => ({ items: SUGGEST_ITEMS }) }
      : { ok: false, status: 404, json: async () => ({}) }));
  vi.stubGlobal("fetch", fetchMock as any);

  render(<IndexSuggestions />);
  await screen.findByText("LBIR");
  await userEvent.selectOptions(screen.getByLabelText(/ai book/i), "book2");
  await userEvent.click(screen.getByRole("button", { name: /ai suggest/i }));
  expect(
    await screen.findByText(/pick a book and a printed page range/i)
  ).toBeInTheDocument();
  expect(
    fetchMock.mock.calls.some(([url]) => String(url).includes("/api/index/ai-suggest"))
  ).toBe(false);
});

test("AI button is disabled when the LLM is unconfigured", async () => {
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    if (url.includes("/api/llm")) return { ok: true, json: async () => LLM_UNCONFIGURED };
    if (url.includes("/api/index/suggest")) {
      return { ok: true, json: async () => ({ items: SUGGEST_ITEMS }) };
    }
    return baseFetch(url) ?? { ok: false, status: 404, json: async () => ({}) };
  }) as any);

  render(<IndexSuggestions />);
  await waitFor(() =>
    expect(screen.getByRole("button", { name: /ai suggest/i })).toBeDisabled());
});
