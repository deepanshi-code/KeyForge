/**
 * Favourites and history, stored only in this browser (no accounts, no server).
 * Secrets are refused here as a second line of defence — the UI never sends
 * them, but this module doesn't trust that.
 */
export interface SavedItem {
  generatorId: string;
  value: string;
  savedAt: number;
}

/** The part of localStorage we use; tests pass an in-memory fake. */
export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

const HISTORY_KEY = "toolkit:history";
const FAVOURITES_KEY = "toolkit:favourites";
export const HISTORY_LIMIT = 100;

function isSavedItem(x: unknown): x is SavedItem {
  if (typeof x !== "object" || x === null) return false;
  const item = x as Record<string, unknown>;
  return typeof item.generatorId === "string" && typeof item.value === "string" && typeof item.savedAt === "number";
}

function sameItem(a: SavedItem, b: SavedItem): boolean {
  return a.generatorId === b.generatorId && a.value === b.value;
}

export function createLibrary(store: KeyValueStore, neverStore: ReadonlySet<string>) {
  function read(key: string): SavedItem[] {
    try {
      const parsed: unknown = JSON.parse(store.getItem(key) ?? "[]");
      return Array.isArray(parsed) ? parsed.filter(isSavedItem).filter(i => !neverStore.has(i.generatorId)) : [];
    } catch {
      return []; // corrupted data: start fresh rather than crash
    }
  }

  function write(key: string, items: SavedItem[]): void {
    try {
      store.setItem(key, JSON.stringify(items));
    } catch {
      // Storage full or blocked (e.g. private mode): the app still works, it just won't remember.
    }
  }

  const allowed = (generatorId: string) => !neverStore.has(generatorId);

  return {
    history: () => read(HISTORY_KEY),
    favourites: () => read(FAVOURITES_KEY),

    addToHistory(generatorId: string, values: string[]): void {
      if (!allowed(generatorId)) return;
      const now = Date.now();
      const fresh = values.map(value => ({ generatorId, value, savedAt: now }));
      const rest = read(HISTORY_KEY).filter(old => !fresh.some(f => sameItem(f, old)));
      write(HISTORY_KEY, [...fresh, ...rest].slice(0, HISTORY_LIMIT));
    },

    isFavourite(generatorId: string, value: string): boolean {
      return read(FAVOURITES_KEY).some(i => i.generatorId === generatorId && i.value === value);
    },

    /** Adds or removes a favourite. Returns true if it is now a favourite. */
    toggleFavourite(generatorId: string, value: string): boolean {
      if (!allowed(generatorId)) return false;
      const item = { generatorId, value, savedAt: Date.now() };
      const favourites = read(FAVOURITES_KEY);
      const exists = favourites.some(f => sameItem(f, item));
      write(FAVOURITES_KEY, exists ? favourites.filter(f => !sameItem(f, item)) : [item, ...favourites]);
      return !exists;
    },

    clearHistory: () => write(HISTORY_KEY, []),
    clearFavourites: () => write(FAVOURITES_KEY, []),

    exportJson(): string {
      return JSON.stringify({ version: 1, favourites: read(FAVOURITES_KEY), history: read(HISTORY_KEY) }, null, 2);
    },

    /** Merges an exported file into the library. Returns how many new items were added. */
    importJson(text: string): number {
      const data: unknown = JSON.parse(text); // throws on invalid JSON; the UI shows the error
      if (typeof data !== "object" || data === null) throw new Error("Not a library export file.");
      const file = data as Record<string, unknown>;
      let added = 0;
      for (const [key, field] of [[FAVOURITES_KEY, "favourites"], [HISTORY_KEY, "history"]] as const) {
        const incoming = Array.isArray(file[field]) ? (file[field] as unknown[]).filter(isSavedItem) : [];
        const current = read(key);
        const newItems: SavedItem[] = [];
        for (const item of incoming) {
          // Check against items added from this file too: a file can list the same name twice.
          if (allowed(item.generatorId) && ![...current, ...newItems].some(c => sameItem(c, item))) newItems.push(item);
        }
        added += newItems.length;
        const merged = [...current, ...newItems].sort((a, b) => b.savedAt - a.savedAt);
        write(key, key === HISTORY_KEY ? merged.slice(0, HISTORY_LIMIT) : merged);
      }
      return added;
    },
  };
}

export type Library = ReturnType<typeof createLibrary>;

/** localStorage if usable, otherwise an in-memory store (lost on reload). */
export function browserStore(): KeyValueStore {
  try {
    const s = window.localStorage;
    s.getItem("toolkit:probe");
    return s;
  } catch {
    const memory = new Map<string, string>();
    return { getItem: k => memory.get(k) ?? null, setItem: (k, v) => void memory.set(k, v), removeItem: k => void memory.delete(k) };
  }
}
