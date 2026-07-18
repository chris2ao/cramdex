export type Store<T> = {
  get(): T;
  set(updater: (current: T) => T): void;
  subscribe(cb: () => void): () => void;
};

function hasLocalStorage(): boolean {
  return typeof window !== "undefined" && !!window.localStorage;
}

function readValid<T>(key: string, guard: (v: unknown) => v is T, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    if (raw == null) return fallback;
    const parsed: unknown = JSON.parse(raw);
    return guard(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function writeThrough(key: string, value: unknown): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Quota exceeded or private-mode storage denial: in-memory state still updates.
  }
}

/**
 * A localStorage-backed store: JSON persisted under `key`, validated against `guard`
 * on read (any failure silently falls back to `initial`), immutable snapshots,
 * and cross-tab sync via the window `storage` event.
 */
export function createStore<T>(key: string, guard: (v: unknown) => v is T, initial: T): Store<T> {
  const persistent = hasLocalStorage();
  let state: T = persistent ? readValid(key, guard, initial) : initial;
  const listeners = new Set<() => void>();

  function notify(): void {
    for (const cb of listeners) cb();
  }

  if (persistent) {
    window.addEventListener("storage", (e: StorageEvent) => {
      if (e.key !== key) return;
      state = readValid(key, guard, initial);
      notify();
    });
  }

  return {
    get(): T {
      return state;
    },
    set(updater: (current: T) => T): void {
      state = updater(state);
      if (persistent) writeThrough(key, state);
      notify();
    },
    subscribe(cb: () => void): () => void {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
  };
}
