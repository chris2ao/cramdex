/**
 * Node's built-in experimental `localStorage` global shadows jsdom's real
 * implementation in this vitest environment: vitest's jsdom-environment
 * key-copy step skips any key already present on globalThis, and Node
 * predefines `localStorage` (as a non-functional stub without a
 * --localstorage-file flag) and `Storage` (non-constructible outside Node's
 * own internals). That leaves `window.localStorage` unusable for tests.
 *
 * This installs a minimal in-memory Storage stand-in directly on `window`,
 * bypassing that collision. Import this once, for its side effect, before
 * any test touches window.localStorage.
 */
class MemoryStorage implements Storage {
  private data = new Map<string, string>();

  get length(): number {
    return this.data.size;
  }

  clear(): void {
    this.data.clear();
  }

  getItem(key: string): string | null {
    return this.data.has(key) ? this.data.get(key)! : null;
  }

  key(index: number): string | null {
    return Array.from(this.data.keys())[index] ?? null;
  }

  removeItem(key: string): void {
    this.data.delete(key);
  }

  setItem(key: string, value: string): void {
    this.data.set(key, String(value));
  }
}

if (typeof window !== "undefined") {
  Object.defineProperty(window, "localStorage", { value: new MemoryStorage(), configurable: true });
}
