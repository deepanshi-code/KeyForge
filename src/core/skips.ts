import type { KeyValueStore } from "./library.ts";

/**
 * Names you saw but didn't star, per generator: the "no" signal for
 * learning-to-rank. Kept in the same store as favourites, so for a signed-in
 * profile they're encrypted too. Only recent ones are kept.
 */
const KEY = "toolkit:skips";
export const SKIP_LIMIT = 300;

export function createSkips(store: KeyValueStore) {
  function read(): Record<string, string[]> {
    try {
      const data: unknown = JSON.parse(store.getItem(KEY) ?? "{}");
      return data && typeof data === "object" ? (data as Record<string, string[]>) : {};
    } catch {
      return {};
    }
  }

  return {
    list: (generatorId: string): string[] => (Array.isArray(read()[generatorId]) ? read()[generatorId] : []),

    add(generatorId: string, values: readonly string[]): void {
      if (values.length === 0) return;
      const data = read();
      const fresh = values.filter(v => !(data[generatorId] ?? []).includes(v));
      data[generatorId] = [...fresh, ...(data[generatorId] ?? [])].slice(0, SKIP_LIMIT);
      try {
        store.setItem(KEY, JSON.stringify(data));
      } catch {
        // storage unavailable: learning just has less to go on
      }
    },

    clear: () => store.setItem(KEY, "{}"),
  };
}
