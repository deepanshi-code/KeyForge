import { describe, expect, it } from "vitest";
import { createLibrary, HISTORY_LIMIT, type KeyValueStore } from "./library.ts";

function memoryStore(initial: Record<string, string> = {}): KeyValueStore {
  const data = new Map(Object.entries(initial));
  return { getItem: k => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v), removeItem: k => void data.delete(k) };
}

const SECRET_IDS = new Set(["password"]);

describe("library", () => {
  it("keeps newest history first, without duplicates", () => {
    const lib = createLibrary(memoryStore(), SECRET_IDS);
    lib.addToHistory("username", ["a", "b"]);
    lib.addToHistory("username", ["c", "a"]);
    expect(lib.history().map(i => i.value)).toEqual(["c", "a", "b"]);
  });

  it(`caps history at ${HISTORY_LIMIT} items`, () => {
    const lib = createLibrary(memoryStore(), SECRET_IDS);
    lib.addToHistory("username", Array.from({ length: HISTORY_LIMIT + 20 }, (_, i) => `u${i}`));
    expect(lib.history()).toHaveLength(HISTORY_LIMIT);
  });

  it("never stores sensitive generators", () => {
    const lib = createLibrary(memoryStore(), SECRET_IDS);
    lib.addToHistory("password", ["hunter2"]);
    expect(lib.toggleFavourite("password", "hunter2")).toBe(false);
    expect(lib.history()).toEqual([]);
    expect(lib.favourites()).toEqual([]);
  });

  it("toggles favourites on and off", () => {
    const lib = createLibrary(memoryStore(), SECRET_IDS);
    expect(lib.toggleFavourite("team-name", "Byte Brigade")).toBe(true);
    expect(lib.isFavourite("team-name", "Byte Brigade")).toBe(true);
    expect(lib.toggleFavourite("team-name", "Byte Brigade")).toBe(false);
    expect(lib.favourites()).toEqual([]);
  });

  it("survives corrupted storage", () => {
    const lib = createLibrary(memoryStore({ "toolkit:history": "{not json" }), SECRET_IDS);
    expect(lib.history()).toEqual([]);
  });

  it("round-trips through export and import", () => {
    const source = createLibrary(memoryStore(), SECRET_IDS);
    source.addToHistory("username", ["one", "two"]);
    source.toggleFavourite("project-name", "Cloudata");

    const target = createLibrary(memoryStore(), SECRET_IDS);
    expect(target.importJson(source.exportJson())).toBe(3);
    expect(target.favourites().map(i => i.value)).toEqual(["Cloudata"]);
    expect(target.history().map(i => i.value).sort()).toEqual(["one", "two"]);
    // Importing again adds nothing new.
    expect(target.importJson(source.exportJson())).toBe(0);
  });

  it("ignores secrets and malformed items in imported files", () => {
    const lib = createLibrary(memoryStore(), SECRET_IDS);
    const file = JSON.stringify({
      favourites: [
        { generatorId: "password", value: "leaked", savedAt: 1 },
        { generatorId: "username", value: 42, savedAt: 1 },
        { generatorId: "username", value: "ok", savedAt: 1 },
      ],
    });
    expect(lib.importJson(file)).toBe(1);
    expect(lib.favourites().map(i => i.value)).toEqual(["ok"]);
  });

  it("imports an item listed twice in the same file only once", () => {
    const lib = createLibrary(memoryStore(), SECRET_IDS);
    const item = { generatorId: "username", value: "twice", savedAt: 1 };
    const file = JSON.stringify({ favourites: [item, item], history: [item, { ...item, savedAt: 2 }] });
    expect(lib.importJson(file)).toBe(2); // one favourite + one history item
    expect(lib.favourites()).toHaveLength(1);
    expect(lib.history()).toHaveLength(1);
  });

  it("rejects files that aren't JSON", () => {
    const lib = createLibrary(memoryStore(), SECRET_IDS);
    expect(() => lib.importJson("hello")).toThrow();
  });
});
