import { createStore } from "./store";
import type { Store } from "./store";

export type LabsState = { overrides: Record<string, boolean> };

const INITIAL: LabsState = { overrides: {} };

function isLabsState(v: unknown): v is LabsState {
  if (typeof v !== "object" || v === null) return false;
  const overrides = (v as Partial<LabsState>).overrides;
  if (typeof overrides !== "object" || overrides === null) return false;
  return Object.values(overrides).every((d) => typeof d === "boolean");
}

export const labsStore: Store<LabsState> = createStore("cramdex.labs", isLabsState, INITIAL);

/** Manually marks a lab done/open, overriding its computed default. */
export function setLabDone(id: string, done: boolean): void {
  labsStore.set((state) => ({ overrides: { ...state.overrides, [id]: done } }));
}

/** Clears a manual override, reverting the lab to its computed default. */
export function clearLabOverride(id: string): void {
  labsStore.set((state) => {
    const overrides = { ...state.overrides };
    delete overrides[id];
    return { overrides };
  });
}

/** Whether a lab counts as done: the manual override if set, else defaultDone. */
export function labDone(state: LabsState, id: string, defaultDone: boolean): boolean {
  return state.overrides[id] ?? defaultDone;
}
