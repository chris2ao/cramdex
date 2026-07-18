import { useSyncExternalStore } from "react";
import type { Store } from "./store";

/** Subscribes a component to the whole state of `store` via useSyncExternalStore. */
export function useStore<T>(store: Store<T>): T {
  return useSyncExternalStore(store.subscribe, store.get);
}
