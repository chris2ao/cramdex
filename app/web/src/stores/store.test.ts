import "./testLocalStorage";
import { createStore } from "./store";

type Counter = { count: number };
const isCounter = (v: unknown): v is Counter =>
  typeof v === "object" && v !== null && typeof (v as Counter).count === "number";

const KEY = "cramdex.test-counter";

beforeEach(() => {
  window.localStorage.clear();
});

test("get returns initial value when nothing persisted", () => {
  const store = createStore<Counter>(KEY, isCounter, { count: 0 });
  expect(store.get()).toEqual({ count: 0 });
});

test("set persists to window.localStorage and a new store instance reads it back", () => {
  const store = createStore<Counter>(KEY, isCounter, { count: 0 });
  store.set((c) => ({ count: c.count + 1 }));
  expect(store.get()).toEqual({ count: 1 });

  const reloaded = createStore<Counter>(KEY, isCounter, { count: 0 });
  expect(reloaded.get()).toEqual({ count: 1 });
});

test("corrupt JSON in window.localStorage falls back to initial", () => {
  window.localStorage.setItem(KEY, "{not valid json");
  const store = createStore<Counter>(KEY, isCounter, { count: 0 });
  expect(store.get()).toEqual({ count: 0 });
});

test("wrong-shape JSON in window.localStorage falls back to initial", () => {
  window.localStorage.setItem(KEY, JSON.stringify({ wrong: "shape" }));
  const store = createStore<Counter>(KEY, isCounter, { count: 0 });
  expect(store.get()).toEqual({ count: 0 });
});

test("missing key in window.localStorage falls back to initial", () => {
  const store = createStore<Counter>(KEY, isCounter, { count: 0 });
  expect(store.get()).toEqual({ count: 0 });
});

test("get() is referentially stable until set() is called", () => {
  const store = createStore<Counter>(KEY, isCounter, { count: 0 });
  const first = store.get();
  const second = store.get();
  expect(first).toBe(second);
  store.set((c) => ({ count: c.count + 1 }));
  const third = store.get();
  expect(third).not.toBe(second);
});

test("set() does not mutate the previous snapshot (immutability)", () => {
  const store = createStore<Counter>(KEY, isCounter, { count: 0 });
  const before = store.get();
  store.set((c) => ({ count: c.count + 5 }));
  expect(before).toEqual({ count: 0 });
  expect(store.get()).toEqual({ count: 5 });
});

test("subscribe notifies listeners on set and unsubscribe stops notifications", () => {
  const store = createStore<Counter>(KEY, isCounter, { count: 0 });
  const cb = vi.fn();
  const unsubscribe = store.subscribe(cb);
  store.set((c) => ({ count: c.count + 1 }));
  expect(cb).toHaveBeenCalledTimes(1);
  unsubscribe();
  store.set((c) => ({ count: c.count + 1 }));
  expect(cb).toHaveBeenCalledTimes(1);
});

test("localStorage.setItem throwing (quota exceeded) does not throw and state still updates in memory", () => {
  const store = createStore<Counter>(KEY, isCounter, { count: 0 });
  const spy = vi.spyOn(window.localStorage, "setItem").mockImplementation(() => {
    throw new Error("QuotaExceededError");
  });
  expect(() => store.set((c) => ({ count: c.count + 1 }))).not.toThrow();
  expect(store.get()).toEqual({ count: 1 });
  spy.mockRestore();
});

test("cross-tab sync: a storage event for this key re-validates and notifies subscribers", () => {
  const store = createStore<Counter>(KEY, isCounter, { count: 0 });
  const cb = vi.fn();
  store.subscribe(cb);

  const next: Counter = { count: 42 };
  window.localStorage.setItem(KEY, JSON.stringify(next));
  window.dispatchEvent(new StorageEvent("storage", { key: KEY, newValue: JSON.stringify(next) }));

  expect(store.get()).toEqual({ count: 42 });
  expect(cb).toHaveBeenCalled();
});

test("storage event with corrupt newValue falls back to initial", () => {
  const store = createStore<Counter>(KEY, isCounter, { count: 0 });
  store.set((c) => ({ count: c.count + 1 }));

  window.localStorage.setItem(KEY, "not json");
  window.dispatchEvent(new StorageEvent("storage", { key: KEY, newValue: "not json" }));
  expect(store.get()).toEqual({ count: 0 });
});

test("storage event for a different key is ignored", () => {
  const store = createStore<Counter>(KEY, isCounter, { count: 0 });
  store.set((c) => ({ count: c.count + 1 }));
  const before = store.get();

  window.dispatchEvent(new StorageEvent("storage", { key: "cramdex.other", newValue: "{}" }));
  expect(store.get()).toBe(before);
});

test("works without localStorage (non-browser guard), in-memory only", () => {
  const descriptor = Object.getOwnPropertyDescriptor(window, "localStorage")!;
  Object.defineProperty(window, "localStorage", { value: undefined, configurable: true });
  try {
    const store = createStore<Counter>("cramdex.no-ls", isCounter, { count: 0 });
    expect(store.get()).toEqual({ count: 0 });
    expect(() => store.set((c) => ({ count: c.count + 1 }))).not.toThrow();
    expect(store.get()).toEqual({ count: 1 });
  } finally {
    Object.defineProperty(window, "localStorage", descriptor);
  }
});
