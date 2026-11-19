/**
 * Vitest setup: guarantee a working Web Storage implementation in the jsdom
 * environment.
 *
 * Node 25+ ships an experimental global `localStorage`/`sessionStorage` that is
 * `undefined` unless `--localstorage-file` is provided. That built-in global
 * shadows jsdom's implementation, so `window.localStorage` becomes unusable on
 * newer Node versions while it works on Node 22. This setup installs an
 * in-memory `Storage` only when the current one is missing or unusable, so
 * environments where jsdom storage already works are left untouched.
 */

class MemoryStorage implements Storage {
  readonly #entries = new Map<string, string>();

  get length(): number {
    return this.#entries.size;
  }

  clear(): void {
    this.#entries.clear();
  }

  getItem(key: string): string | null {
    return this.#entries.get(String(key)) ?? null;
  }

  key(index: number): string | null {
    return Array.from(this.#entries.keys())[index] ?? null;
  }

  removeItem(key: string): void {
    this.#entries.delete(String(key));
  }

  setItem(key: string, value: string): void {
    this.#entries.set(String(key), String(value));
  }
}

function isUsableStorage(candidate: unknown): boolean {
  if (candidate === null || typeof candidate !== "object") {
    return false;
  }
  try {
    const storage = candidate as Storage;
    const probeKey = "__chilla_vitest_storage_probe__";
    storage.setItem(probeKey, "1");
    storage.removeItem(probeKey);
    return true;
  } catch {
    return false;
  }
}

function readStorage(
  name: "localStorage" | "sessionStorage",
): Storage | undefined {
  try {
    return globalThis[name];
  } catch {
    return undefined;
  }
}

function ensureStorage(name: "localStorage" | "sessionStorage"): void {
  if (isUsableStorage(readStorage(name))) {
    return;
  }
  const storage = new MemoryStorage();
  const descriptor: PropertyDescriptor = {
    configurable: true,
    enumerable: true,
    get: () => storage,
  };
  Object.defineProperty(globalThis, name, descriptor);
  if (typeof window !== "undefined" && window !== globalThis) {
    Object.defineProperty(window, name, descriptor);
  }
}

ensureStorage("localStorage");
ensureStorage("sessionStorage");
