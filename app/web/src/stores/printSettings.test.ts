import "./testLocalStorage";
import { printSettingsStore, updatePrintSettings } from "./printSettings";

beforeEach(() => {
  window.localStorage.clear();
  printSettingsStore.set(() => ({
    letterBreaks: false, coverSheet: true, fontSize: "m", columns: 2,
  }));
});

test("defaults favor a two-column index with a cover sheet", () => {
  const s = printSettingsStore.get();
  expect(s).toEqual({ letterBreaks: false, coverSheet: true, fontSize: "m", columns: 2 });
});

test("updatePrintSettings patches immutably and persists", () => {
  const before = printSettingsStore.get();
  updatePrintSettings({ letterBreaks: true, fontSize: "l" });
  const after = printSettingsStore.get();
  expect(after).toEqual({ letterBreaks: true, coverSheet: true, fontSize: "l", columns: 2 });
  expect(before).toEqual({ letterBreaks: false, coverSheet: true, fontSize: "m", columns: 2 });
  expect(window.localStorage.getItem("cramdex.printSettings")).toContain("\"fontSize\":\"l\"");
});

test("invalid persisted state falls back to defaults", async () => {
  window.localStorage.setItem("cramdex.printSettings", '{"columns": 3}');
  vi.resetModules();
  const fresh = await import("./printSettings");
  expect(fresh.printSettingsStore.get().columns).toBe(2);
});
