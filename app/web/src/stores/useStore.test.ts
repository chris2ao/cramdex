import "./testLocalStorage";
import { act, renderHook } from "@testing-library/react";
import { createStore } from "./store";
import { useStore } from "./useStore";

type Counter = { count: number };
const isCounter = (v: unknown): v is Counter =>
  typeof v === "object" && v !== null && typeof (v as Counter).count === "number";

beforeEach(() => {
  window.localStorage.clear();
});

test("returns the current store value and re-renders on set", () => {
  const store = createStore<Counter>("cramdex.use-store-test", isCounter, { count: 0 });
  const { result } = renderHook(() => useStore(store));
  expect(result.current).toEqual({ count: 0 });

  act(() => {
    store.set((c) => ({ count: c.count + 1 }));
  });
  expect(result.current).toEqual({ count: 1 });
});

test("two components sharing a store both see updates", () => {
  const store = createStore<Counter>("cramdex.use-store-test-2", isCounter, { count: 0 });
  const a = renderHook(() => useStore(store));
  const b = renderHook(() => useStore(store));

  act(() => {
    store.set((c) => ({ count: c.count + 10 }));
  });
  expect(a.result.current).toEqual({ count: 10 });
  expect(b.result.current).toEqual({ count: 10 });
});
