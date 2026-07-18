import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { LightboxProvider } from "../components/Lightbox";
import { resetLlmCache } from "../lib/llm";
import { Ask } from "./Ask";

const LLM_CONFIGURED = {
  name: "anthropic_api", display_name: "Anthropic API",
  configured: true, detail: "key present",
};
const LLM_UNCONFIGURED = {
  name: "claude_cli", display_name: "Claude CLI",
  configured: false, detail: "claude command not found on PATH",
};

function sseResponse(text: string): Response {
  const stream = new ReadableStream({
    start(c) { c.enqueue(new TextEncoder().encode(text)); c.close(); },
  });
  return new Response(stream, { status: 200 });
}

// URL-aware fetch stub: routes /api/llm to the given status payload (or
// never resolves, for loading-state tests) and everything else to the SSE
// body, mirroring how the real /api/ask stream is proxied.
function stubFetch(sse: string, llm: unknown = LLM_CONFIGURED) {
  const fn = vi.fn(async (url: string) => {
    if (typeof url === "string" && url.includes("/api/llm")) {
      if (llm === null) return new Promise<Response>(() => {}); // never resolves
      return new Response(JSON.stringify(llm), { status: 200 });
    }
    return sseResponse(sse);
  });
  vi.stubGlobal("fetch", fn as any);
  return fn;
}

beforeEach(() => {
  resetLlmCache();
});

function renderAsk() {
  return render(<MemoryRouter><LightboxProvider><Ask /></LightboxProvider></MemoryRouter>);
}

async function ask() {
  await userEvent.type(screen.getByPlaceholderText(/first hour of an incident/i), "q");
  await userEvent.click(screen.getByRole("button", { name: /ask/i }));
}

test("stream ending without done/error surfaces an error, not silent done", async () => {
  stubFetch("event: sources\ndata: []\n\nevent: delta\ndata: partial answer\n\n");
  renderAsk();
  await ask();
  expect(await screen.findByText(/ended unexpectedly/i)).toBeInTheDocument();
  expect(screen.getByText(/partial answer/)).toBeInTheDocument();
});

test("stream ending with done stays done, no error", async () => {
  stubFetch("event: sources\ndata: []\n\nevent: delta\ndata: full answer\n\nevent: done\ndata: \n\n");
  renderAsk();
  await ask();
  expect(await screen.findByText(/full answer/)).toBeInTheDocument();
  expect(screen.queryByText(/ended unexpectedly/i)).not.toBeInTheDocument();
});

test("renders passages with citation chips and a passage count in the response header", async () => {
  const sources = JSON.stringify([
    { slug: "book2", label: "Book 2", printed_page: 76, snippet: "ops [[tempo]] cadence" },
    { slug: "book2", label: "Book 2", printed_page: 81, snippet: "shift ops" },
  ]);
  stubFetch(`event: sources\ndata: ${sources}\n\nevent: delta\ndata: answer body\n\nevent: done\ndata: \n\n`);
  renderAsk();
  await ask();
  expect(await screen.findByText(/2 PASSAGES_READ/)).toBeInTheDocument();
  const chips = screen.getAllByRole("button", { name: /Book 2 p\.76/i });
  expect(chips.length).toBeGreaterThan(0);
  expect(screen.getByText("tempo")).toBeInTheDocument();
});

test("citation chip in a passage opens the lightbox", async () => {
  const sources = JSON.stringify([
    { slug: "book2", label: "Book 2", printed_page: 76, snippet: "ops tempo" },
  ]);
  stubFetch(`event: sources\ndata: ${sources}\n\nevent: done\ndata: \n\n`);
  renderAsk();
  await ask();
  const chip = await screen.findByRole("button", { name: /Book 2 p\.76/i });
  await userEvent.click(chip);
  expect(await screen.findByRole("dialog")).toBeInTheDocument();
});

test("shows a Cancel affordance while streaming, then returns to Ask when done", async () => {
  let ctrl!: ReadableStreamDefaultController<Uint8Array>;
  const stream = new ReadableStream<Uint8Array>({
    start(c) {
      ctrl = c;
      c.enqueue(new TextEncoder().encode(
        "event: sources\ndata: []\n\nevent: delta\ndata: streaming...\n\n"));
    },
  });
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    if (typeof url === "string" && url.includes("/api/llm")) {
      return new Response(JSON.stringify(LLM_CONFIGURED), { status: 200 });
    }
    return new Response(stream, { status: 200 });
  }) as any);
  renderAsk();
  await ask();
  const cancel = await screen.findByRole("button", { name: /cancel/i });
  expect(cancel).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /ask ▸|^ask$/i })).not.toBeInTheDocument();
  // Close the stream cleanly; the affordance should swap back to Ask.
  ctrl.enqueue(new TextEncoder().encode("event: done\ndata: \n\n"));
  ctrl.close();
  expect(await screen.findByRole("button", { name: /ask/i })).toBeInTheDocument();
});

test("shows the active provider label once the LLM status has loaded", async () => {
  stubFetch("event: done\ndata: \n\n", LLM_CONFIGURED);
  renderAsk();
  expect(await screen.findByText(/Anthropic API/)).toBeInTheDocument();
  expect(screen.queryByText(/AI answers need an LLM provider/i)).not.toBeInTheDocument();
});

test("does not disable Ask or show the notice while the LLM status is still loading", async () => {
  stubFetch("event: done\ndata: \n\n", null);
  renderAsk();
  expect(screen.getByRole("button", { name: /ask/i })).not.toBeDisabled();
  expect(screen.queryByText(/AI answers need an LLM provider/i)).not.toBeInTheDocument();
});

test("disables Ask and shows a provider notice when the LLM is not configured", async () => {
  stubFetch("event: done\ndata: \n\n", LLM_UNCONFIGURED);
  renderAsk();
  const notice = await screen.findByText(/AI answers need an LLM provider/i);
  expect(notice).toHaveTextContent(/Claude CLI/);
  expect(notice).toHaveTextContent(/claude command not found on path/i);
  expect(screen.getByRole("button", { name: /ask/i })).toBeDisabled();
});

test("Enter does not submit the question while the LLM is unconfigured", async () => {
  const fetchMock = stubFetch("event: done\ndata: \n\n", LLM_UNCONFIGURED);
  renderAsk();
  await screen.findByText(/AI answers need an LLM provider/i);
  await userEvent.type(screen.getByPlaceholderText(/first hour of an incident/i), "q{Enter}");
  expect(fetchMock.mock.calls.some(
    ([url]) => typeof url === "string" && url.includes("/api/ask"))).toBe(false);
});
