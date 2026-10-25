import type { KeyValueStore } from "./library.ts";

/**
 * Measures whether taste learning actually helps: how often the user stars a
 * result when results were taste-ranked vs. plain random. Stored only in this
 * browser. Small numbers mean little — the UI says so.
 */
export type Mode = "taste" | "random";

interface Counts { shown: number; starred: number }
type StatsData = Record<Mode, Counts>;

const KEY = "toolkit:stats";
const empty = (): StatsData => ({ taste: { shown: 0, starred: 0 }, random: { shown: 0, starred: 0 } });

export function createStats(store: KeyValueStore) {
  function read(): StatsData {
    try {
      const data = JSON.parse(store.getItem(KEY) ?? "null") as StatsData | null;
      if (data && typeof data.taste?.shown === "number" && typeof data.random?.shown === "number") return data;
    } catch {
      // corrupted: start again
    }
    return empty();
  }

  function write(data: StatsData): void {
    try {
      store.setItem(KEY, JSON.stringify(data));
    } catch {
      // storage unavailable: stats just won't persist
    }
  }

  return {
    recordShown(mode: Mode, n: number): void {
      const data = read();
      data[mode].shown += n;
      write(data);
    },
    recordStar(mode: Mode): void {
      const data = read();
      data[mode].starred += 1;
      write(data);
    },
    /** Takes back a star recorded earlier (the user un-starred it). */
    removeStar(mode: Mode): void {
      const data = read();
      data[mode].starred = Math.max(0, data[mode].starred - 1);
      write(data);
    },
    /** Star rate per mode (0–1), or null if nothing was shown yet. */
    summary(): Record<Mode, Counts & { rate: number | null }> {
      const data = read();
      const withRate = (c: Counts) => ({ ...c, rate: c.shown > 0 ? c.starred / c.shown : null });
      return { taste: withRate(data.taste), random: withRate(data.random) };
    },
    reset: () => write(empty()),
  };
}

export type Stats = ReturnType<typeof createStats>;

/**
 * Credits stars on the visible batch to the mode that picked it. Each value
 * counts at most once, and un-starring takes the credit back — otherwise
 * clicking ☆ on, off, on would count as two stars and inflate the star rate.
 */
export function createBatchStars(stats: Stats) {
  let mode: Mode | null = null;
  const credited = new Set<string>();

  return {
    /** A new batch is on screen. null = warm-up: stars aren't counted. */
    newBatch(batchMode: Mode | null): void {
      mode = batchMode;
      credited.clear();
    },
    /** Call after the user toggles a star on a result in this batch. */
    toggled(value: string, nowFavourite: boolean): void {
      if (!mode) return;
      if (nowFavourite && !credited.has(value)) {
        credited.add(value);
        stats.recordStar(mode);
      } else if (!nowFavourite && credited.delete(value)) {
        stats.removeStar(mode);
      }
    },
  };
}
