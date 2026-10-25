import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHistoryBuffer } from "./history-buffer.ts";

describe("history buffer", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("saves only the batch the user settles on, not each one while typing", () => {
    const saved: string[][] = [];
    const buffer = createHistoryBuffer((_id, values) => saved.push(values), 1500);
    for (const typed of ["d", "de", "dee", "deep", "deepa"]) {
      buffer.offer("username", [`${typed}_1`]);
      vi.advanceTimersByTime(400); // typing debounce: faster than the settle time
    }
    vi.advanceTimersByTime(1500);
    expect(saved).toEqual([["deepa_1"]]);
  });

  it("saves immediately on commit, and only once", () => {
    const saved: string[][] = [];
    const buffer = createHistoryBuffer((_id, values) => saved.push(values), 1500);
    buffer.offer("username", ["copied_1"]);
    buffer.commit(); // e.g. the user copied a result
    vi.advanceTimersByTime(5000);
    buffer.commit();
    expect(saved).toEqual([["copied_1"]]);
  });
});
