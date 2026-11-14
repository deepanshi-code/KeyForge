import { describe, expect, it } from "vitest";
import { generateBatch } from "./batch.ts";
import { auc, FEATURE_NAMES, features, FEATURES, trainRanker } from "./rank.ts";
import { seededRng } from "./rng.ts";
import { createSkips, SKIP_LIMIT } from "./skips.ts";
import { trainTaste } from "./taste.ts";
import { usernameGenerator } from "../generators/username.ts";

/** A pool of realistic candidates, split by a hidden "user preference". */
function simulate(prefers: (name: string) => boolean, seed: string) {
  const rng = seededRng(seed);
  const pool = ["underscore", "none", "dot"].flatMap(separator =>
    generateBatch(usernameGenerator, { ...usernameGenerator.defaults, separator, maxLength: 20 }, 200, rng).values);
  const liked = pool.filter(prefers);
  const skipped = pool.filter(v => !prefers(v));
  const half = <T,>(a: T[]) => [a.slice(0, Math.floor(a.length / 2)), a.slice(Math.floor(a.length / 2))];
  const [likedTrain, likedTest] = half(liked);
  const [skippedTrain, skippedTest] = half(skipped);
  return { likedTrain, likedTest, skippedTrain, skippedTest };
}

describe("learning-to-rank", () => {
  it("turns a name into a fixed-size feature vector", () => {
    const x = features("FormSaathi");
    expect(x).toHaveLength(FEATURES);
    expect(x[0]).toBe(1); // bias
    expect(x[FEATURE_NAMES.indexOf("Hindi word")]).toBe(1);
  });

  // Simulated users with a hidden taste; the ranker sees only stars and skips,
  // and is scored on names it hasn't seen (held-out half).
  const users: [string, (n: string) => boolean][] = [
    ["likes short names", n => n.length <= 11],
    ["likes names with a k sound", n => /k|c[aou]/.test(n)],
    ["dislikes underscores", n => !n.includes("_")],
  ];
  for (const [label, prefers] of users) {
    it(`learns a user who ${label} (held-out AUC > 0.8)`, () => {
      const s = simulate(prefers, label);
      const ranker = trainRanker(s.likedTrain, s.skippedTrain);
      expect(auc(ranker, s.likedTest, s.skippedTest)).toBeGreaterThan(0.8);
    });
  }

  it("beats the stars-only trigram model when the taste is about what to avoid", () => {
    const s = simulate(n => n.length <= 11, "compare");
    const withSkips = auc(trainRanker(s.likedTrain, s.skippedTrain), s.likedTest, s.skippedTest);
    const starsOnly = auc(trainTaste(s.likedTrain), s.likedTest, s.skippedTest);
    expect(withSkips).toBeGreaterThan(starsOnly);
  });

  it("AUC is 0.5 for a model that can't tell names apart", () => {
    expect(auc({ score: () => 0 }, ["a", "b"], ["c", "d"])).toBe(0.5);
  });
});

describe("skips", () => {
  const memory = () => {
    const data = new Map<string, string>();
    return { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v), removeItem: (k: string) => void data.delete(k) };
  };

  it("keeps recent skips per generator, newest first, without duplicates", () => {
    const skips = createSkips(memory());
    skips.add("username", ["a", "b"]);
    skips.add("username", ["c", "a"]);
    skips.add("project-name", ["x"]);
    expect(skips.list("username")).toEqual(["c", "a", "b"]);
    expect(skips.list("project-name")).toEqual(["x"]);
  });

  it(`keeps at most ${SKIP_LIMIT}`, () => {
    const skips = createSkips(memory());
    skips.add("username", Array.from({ length: SKIP_LIMIT + 50 }, (_, i) => `n${i}`));
    expect(skips.list("username")).toHaveLength(SKIP_LIMIT);
  });
});
