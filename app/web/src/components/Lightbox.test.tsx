import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LightboxProvider, useLightbox } from "./Lightbox";
import { fireEvent } from "@testing-library/react";
import { resetCourseCache } from "../lib/course";

function Opener() {
  const { open } = useLightbox();
  return <button onClick={() => open({ slug: "book1", label: "Book 1", page: 70 })}>go</button>;
}

test("a failed page render recovers when navigating to another page", async () => {
  render(<LightboxProvider><Opener /></LightboxProvider>);
  await userEvent.click(screen.getByRole("button", { name: "go" }));
  const img = screen.getByRole("img", { name: /Book 1 page 70/ });
  fireEvent.error(img);
  expect(screen.getByText(/Page unavailable/)).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: /next/i }));
  expect(screen.queryByText(/Page unavailable/)).not.toBeInTheDocument();
  expect(screen.getByRole("img", { name: /Book 1 page 71/ })).toBeInTheDocument();
});

test("the panel is an accessible, focused dialog", async () => {
  render(<LightboxProvider><Opener /></LightboxProvider>);
  await userEvent.click(screen.getByRole("button", { name: "go" }));
  const dialog = screen.getByRole("dialog");
  expect(dialog).toHaveAttribute("aria-modal", "true");
  expect(dialog).toHaveFocus();
});

test("arrow key navigation prevents the default page scroll", async () => {
  render(<LightboxProvider><Opener /></LightboxProvider>);
  await userEvent.click(screen.getByRole("button", { name: "go" }));
  const event = new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true, cancelable: true });
  window.dispatchEvent(event);
  expect(event.defaultPrevented).toBe(true);
});

test("paging keeps focus on the navigation button", async () => {
  render(<LightboxProvider><Opener /></LightboxProvider>);
  await userEvent.click(screen.getByRole("button", { name: "go" }));
  const next = screen.getByRole("button", { name: /next/i });
  await userEvent.click(next);
  expect(next).toHaveFocus();
});

test("the index capture button opens the dialog with the page citation", async () => {
  resetCourseCache();
  vi.stubGlobal("fetch", vi.fn(async () => ({
    ok: true, json: async () => ({ name: "Demo Course", exam_date: null, books: [] }),
  })) as any);

  render(<LightboxProvider><Opener /></LightboxProvider>);
  await userEvent.click(screen.getByRole("button", { name: "go" }));
  await userEvent.click(screen.getByRole("button", { name: "[+INDEX]" }));

  expect(screen.getByRole("dialog", { name: /add to index/i })).toBeInTheDocument();
  expect(screen.getByText(/BOOK 1 P\.70/)).toBeInTheDocument();

  vi.unstubAllGlobals();
});

test("arrow keys typed in the capture dialog's TERM field do not turn the lightbox page or drift the citation", async () => {
  resetCourseCache();
  vi.stubGlobal("fetch", vi.fn(async () => ({
    ok: true, json: async () => ({ name: "Demo Course", exam_date: null, books: [] }),
  })) as any);

  render(<LightboxProvider><Opener /></LightboxProvider>);
  await userEvent.click(screen.getByRole("button", { name: "go" }));
  await userEvent.click(screen.getByRole("button", { name: "[+INDEX]" }));

  const termInput = screen.getByLabelText("TERM");
  await userEvent.type(termInput, "Rego{ArrowLeft}lith");

  expect(screen.getByText(/BOOK 1 \/\/ P\.70/)).toBeInTheDocument();
  expect(screen.getByText(/CITATION: BOOK 1 P\.70/)).toBeInTheDocument();

  vi.unstubAllGlobals();
});

test("Escape typed in the capture dialog's TERM field closes only the dialog, not the lightbox", async () => {
  resetCourseCache();
  vi.stubGlobal("fetch", vi.fn(async () => ({
    ok: true, json: async () => ({ name: "Demo Course", exam_date: null, books: [] }),
  })) as any);

  render(<LightboxProvider><Opener /></LightboxProvider>);
  await userEvent.click(screen.getByRole("button", { name: "go" }));
  await userEvent.click(screen.getByRole("button", { name: "[+INDEX]" }));

  const termInput = screen.getByLabelText("TERM");
  await userEvent.type(termInput, "{Escape}");

  expect(screen.queryByRole("dialog", { name: /add to index/i })).not.toBeInTheDocument();
  const dialogs = screen.getAllByRole("dialog");
  expect(dialogs).toHaveLength(1);
  expect(dialogs[0]).not.toHaveAttribute("aria-label", "Add to index");
  expect(screen.getByRole("img", { name: /Book 1 page 70/ })).toBeInTheDocument();

  vi.unstubAllGlobals();
});
