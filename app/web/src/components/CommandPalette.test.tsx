import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { LightboxProvider } from "./Lightbox";
import { CommandPalette } from "./CommandPalette";

const hit = (word: string) => ({
  slug: "book1", label: "Book 1", printed_page: 70, snippet: `[[${word}]] result`,
});

beforeAll(() => {
  window.HTMLElement.prototype.scrollIntoView = () => {};
  // cmdk observes item sizes for scroll-into-view; jsdom has no ResizeObserver.
  (window as any).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

test("stale palette response does not overwrite newer results", async () => {
  let resolveSlow: (v: unknown) => void = () => {};
  const slowPromise = new Promise((r) => { resolveSlow = r; });
  vi.stubGlobal("fetch", vi.fn()
    .mockImplementationOnce(() => slowPromise)                       // for "batt"
    .mockImplementationOnce(async () => ({                          // for "battle"
      ok: true, json: async () => ({ results: [hit("fresh")] }),
    })) as any);

  render(<MemoryRouter><LightboxProvider><CommandPalette /></LightboxProvider></MemoryRouter>);
  await userEvent.keyboard("{Meta>}k{/Meta}");
  const input = screen.getByPlaceholderText(/jump to a section/i);
  await userEvent.type(input, "batt");
  await new Promise((r) => setTimeout(r, 250));   // let the first debounce fire
  await userEvent.type(input, "le");
  await new Promise((r) => setTimeout(r, 250));   // let the second debounce fire
  await screen.findByText(/fresh/);
  resolveSlow({ ok: true, json: async () => ({ results: [hit("stale")] }) });
  await waitFor(() => expect(screen.queryByText(/stale/)).not.toBeInTheDocument());
  expect(screen.getByText(/fresh/)).toBeInTheDocument();
});

test("a failed corpus search surfaces a muted unavailable line, cleared on next keystroke", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("network down"); }) as any);

  render(<MemoryRouter><LightboxProvider><CommandPalette /></LightboxProvider></MemoryRouter>);
  await userEvent.keyboard("{Meta>}k{/Meta}");
  const input = screen.getByPlaceholderText(/jump to a section/i);
  await userEvent.type(input, "batt");
  await screen.findByText(/corpus search unavailable/i);

  vi.stubGlobal("fetch", vi.fn(async () => ({
    ok: true, json: async () => ({ results: [hit("fresh")] }),
  })) as any);
  await userEvent.type(input, "le");
  await screen.findByText(/fresh/);
  expect(screen.queryByText(/corpus search unavailable/i)).not.toBeInTheDocument();
});
