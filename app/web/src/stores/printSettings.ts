import { createStore } from "./store";
import type { Store } from "./store";

export type PrintSettingsState = {
  letterBreaks: boolean;
  coverSheet: boolean;
  fontSize: "s" | "m" | "l";
  columns: 1 | 2;
};

const INITIAL: PrintSettingsState = {
  letterBreaks: false, coverSheet: true, fontSize: "m", columns: 2,
};

function isPrintSettingsState(v: unknown): v is PrintSettingsState {
  if (typeof v !== "object" || v === null) return false;
  const s = v as Partial<PrintSettingsState>;
  return (
    typeof s.letterBreaks === "boolean" &&
    typeof s.coverSheet === "boolean" &&
    (s.fontSize === "s" || s.fontSize === "m" || s.fontSize === "l") &&
    (s.columns === 1 || s.columns === 2)
  );
}

export const printSettingsStore: Store<PrintSettingsState> = createStore(
  "cramdex.printSettings", isPrintSettingsState, INITIAL);

export function updatePrintSettings(patch: Partial<PrintSettingsState>): void {
  printSettingsStore.set((s) => ({ ...s, ...patch }));
}
