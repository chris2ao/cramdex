import "./testLocalStorage";
import { countdownParts, setExamDate, settingsStore } from "./settings";

beforeEach(() => {
  window.localStorage.clear();
  settingsStore.set(() => ({ examDate: null }));
});

test("exam date is unset by default on a fresh store", async () => {
  window.localStorage.clear();
  vi.resetModules();
  const fresh = await import("./settings");
  expect(fresh.settingsStore.get().examDate).toBeNull();
});

test("setExamDate updates the stored date, including clearing it to null", () => {
  setExamDate("2026-12-01");
  expect(settingsStore.get().examDate).toBe("2026-12-01");
  setExamDate(null);
  expect(settingsStore.get().examDate).toBeNull();
});

test("countdownParts returns null when examDate is unset", () => {
  expect(countdownParts(settingsStore.get(), Date.now())).toBeNull();
});

test("countdownParts returns null when the exam date is in the past", () => {
  setExamDate("2020-01-01");
  expect(countdownParts(settingsStore.get(), Date.now())).toBeNull();
});

test("countdownParts computes days, hours, and minutes remaining, floored", () => {
  const now = new Date("2099-03-12T00:00:00.000Z").getTime();
  setExamDate("2099-03-14T12:30:00.000Z");
  const parts = countdownParts(settingsStore.get(), now);
  expect(parts).toEqual({ days: 2, hours: 12, minutes: 30 });
});
