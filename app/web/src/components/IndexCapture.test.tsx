import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "../stores/testLocalStorage";
import { examIndexStore } from "../stores/examIndex";
import { resetCourseCache } from "../lib/course";
import { AddToIndexButton, IndexCaptureDialog } from "./IndexCapture";

const COURSE = { name: "Demo Course", exam_date: null, books: [
  { slug: "book1", label: "Book 1" }, { slug: "book2", label: "Book 2" },
]};

beforeEach(() => {
  window.localStorage.clear();
  examIndexStore.set(() => ({ entries: [], dismissed: [] }));
  resetCourseCache();
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => COURSE })) as any);
});

test("capture button opens a dialog with the citation prefilled and saves", async () => {
  render(<AddToIndexButton slug="book1" label="Book 1" page={6}
                           snippet="Regolith Sweep confirms no dust remains." />);
  await userEvent.click(screen.getByRole("button", { name: "[+INDEX]" }));

  expect(screen.getByRole("dialog", { name: /add to index/i })).toBeInTheDocument();
  expect(screen.getByText(/BOOK 1 P\.6/)).toBeInTheDocument();
  expect(screen.getByLabelText(/definition/i)).toHaveValue(
    "Regolith Sweep confirms no dust remains.");

  await userEvent.type(screen.getByLabelText("TERM"), "Regolith Sweep");
  await userEvent.click(screen.getByRole("button", { name: /save to index/i }));

  const state = examIndexStore.get();
  expect(state.entries).toHaveLength(1);
  expect(state.entries[0].term).toBe("Regolith Sweep");
  expect(state.entries[0].citations).toEqual([{ slug: "book1", label: "Book 1", page: 6 }]);
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});

test("saving without a term shows an error and keeps the dialog open", async () => {
  render(<AddToIndexButton slug="book1" label="Book 1" page={2} />);
  await userEvent.click(screen.getByRole("button", { name: "[+INDEX]" }));
  await userEvent.click(screen.getByRole("button", { name: /save to index/i }));
  expect(screen.getByText(/term is required/i)).toBeInTheDocument();
  expect(examIndexStore.get().entries).toHaveLength(0);
});

test("an existing term shows the merge hint", async () => {
  examIndexStore.set(() => ({
    entries: [{ id: "e1", term: "Dust Lock", definition: "", topic: "", at: 1,
                citations: [{ slug: "book2", label: "Book 2", page: 2 }] }],
    dismissed: [],
  }));
  render(<AddToIndexButton slug="book1" label="Book 1" page={4} />);
  await userEvent.click(screen.getByRole("button", { name: "[+INDEX]" }));
  await userEvent.type(screen.getByLabelText("TERM"), "dust lock");
  expect(screen.getByText(/adds this citation to the existing entry/i)).toBeInTheDocument();
});

test("without a fixed citation the dialog requires book and page", async () => {
  render(<IndexCaptureDialog seed={{}} onClose={() => {}} />);
  await userEvent.type(screen.getByLabelText("TERM"), "Crater Watch");
  await userEvent.click(screen.getByRole("button", { name: /save to index/i }));
  expect(screen.getByText(/pick a book and a printed page/i)).toBeInTheDocument();
  expect(examIndexStore.get().entries).toHaveLength(0);
});

test("a whitespace-only term is rejected with an error and no store write", async () => {
  render(<AddToIndexButton slug="book1" label="Book 1" page={6} />);
  await userEvent.click(screen.getByRole("button", { name: "[+INDEX]" }));
  await userEvent.type(screen.getByLabelText("TERM"), "   ");
  await userEvent.click(screen.getByRole("button", { name: /save to index/i }));
  expect(screen.getByText(/term is required/i)).toBeInTheDocument();
  expect(examIndexStore.get().entries).toHaveLength(0);
});

test("a blank-citation page input of '3.5' is rejected with an error and no store write", async () => {
  render(<IndexCaptureDialog seed={{}} onClose={() => {}} />);
  await userEvent.type(screen.getByLabelText("TERM"), "Regolith Sweep");
  await userEvent.selectOptions(screen.getByLabelText("Citation book"), "book1");
  await userEvent.type(screen.getByLabelText("Citation printed page"), "3.5");
  await userEvent.click(screen.getByRole("button", { name: /save to index/i }));
  expect(screen.getByText(/pick a book and a printed page/i)).toBeInTheDocument();
  expect(examIndexStore.get().entries).toHaveLength(0);
});

test("a blank-citation page input of '0' is rejected with an error and no store write", async () => {
  render(<IndexCaptureDialog seed={{}} onClose={() => {}} />);
  await userEvent.type(screen.getByLabelText("TERM"), "Regolith Sweep");
  await userEvent.selectOptions(screen.getByLabelText("Citation book"), "book1");
  await userEvent.type(screen.getByLabelText("Citation printed page"), "0");
  await userEvent.click(screen.getByRole("button", { name: /save to index/i }));
  expect(screen.getByText(/pick a book and a printed page/i)).toBeInTheDocument();
  expect(examIndexStore.get().entries).toHaveLength(0);
});

test("Escape closes the dialog without writing to the store", async () => {
  render(<AddToIndexButton slug="book1" label="Book 1" page={6} />);
  await userEvent.click(screen.getByRole("button", { name: "[+INDEX]" }));
  await userEvent.type(screen.getByLabelText("TERM"), "Regolith Sweep{Escape}");
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(examIndexStore.get().entries).toHaveLength(0);
});
