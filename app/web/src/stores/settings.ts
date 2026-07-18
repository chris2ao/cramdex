import { createStore } from "./store";
import type { Store } from "./store";

export type SettingsState = {
  /** The user's exam target date (ISO), unset until chosen. */
  examDate: string | null;
};
export type CountdownParts = { days: number; hours: number; minutes: number };

const INITIAL: SettingsState = { examDate: null };

function isSettingsState(v: unknown): v is SettingsState {
  if (typeof v !== "object" || v === null) return false;
  const s = (v as Partial<SettingsState>).examDate;
  return s === null || typeof s === "string";
}

export const settingsStore: Store<SettingsState> = createStore("cramdex.settings", isSettingsState, INITIAL);

export function setExamDate(iso: string | null): void {
  settingsStore.set(() => ({ examDate: iso }));
}

/** Days/hours/minutes remaining until examDate, floored; null if unset or already past. */
export function countdownParts(state: SettingsState, now: number): CountdownParts | null {
  if (!state.examDate) return null;
  const target = new Date(state.examDate).getTime();
  if (Number.isNaN(target)) return null;
  const diff = target - now;
  if (diff <= 0) return null;

  const totalMinutes = Math.floor(diff / 60000);
  const days = Math.floor(totalMinutes / (24 * 60));
  const hours = Math.floor((totalMinutes % (24 * 60)) / 60);
  const minutes = totalMinutes % 60;
  return { days, hours, minutes };
}
