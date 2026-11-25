import { describe, expect, it } from "vitest";
import { PLATFORMS } from "../generators/username.ts";
import { rateName, toHandle, variations } from "./rate.ts";

describe("rate my name", () => {
  it("turns what was typed into a handle", () => {
    expect(toHandle("  Vesper Flux ")).toBe("vesperflux");
  });

  it("rates a short, clean, sayable name highly and says why", () => {
    const r = rateName("vesper.flux");
    expect(r.score).toBeGreaterThanOrEqual(85);
    expect(r.verdict).toBe("Great");
    expect(r.platforms.find(p => p.id === "instagram")?.ok).toBe(true);
    expect(r.notes.some(n => n.good && n.text.includes("syllables"))).toBe(true);
  });

  it("explains each platform that rejects the name", () => {
    const r = rateName("this.name.is.far.too.long.for.x");
    const x = r.platforms.find(p => p.id === "x");
    expect(x?.ok).toBe(false);
    expect(x?.reason).toMatch(/Too long/);
    const github = r.platforms.find(p => p.id === "github");
    expect(github?.reason).toMatch(/Can't use "\."/);
  });

  it("marks down numbers, clumps of consonants and many separators", () => {
    const easy = rateName("lucid_kestrel").score;
    expect(rateName("lucid_kestrel_2004").score).toBeLessThan(easy);
    expect(rateName("xtrkzvn").notes.some(n => !n.good && n.text.includes("hard to pronounce"))).toBe(true);
    expect(rateName("a.b_c.d").score).toBeLessThan(easy);
  });

  it("handles an empty name without crashing", () => {
    expect(rateName("   ").score).toBe(0);
  });

  it("keeps every score between 0 and 100", () => {
    for (const name of ["a", "zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz1234567", "ok", "nova"]) {
      const { score } = rateName(name);
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(100);
    }
  });
});

describe("variations", () => {
  it("suggests close alternatives that follow the platform's rules", () => {
    for (const platform of ["instagram", "github", "x", "discord", "any"]) {
      const list = variations("vesper.flux", platform);
      expect(list.length).toBeGreaterThan(4);
      const rules = PLATFORMS[platform];
      for (const v of list) {
        expect(v.length).toBeGreaterThanOrEqual(rules.min);
        expect(v.length).toBeLessThanOrEqual(rules.max);
        expect(v).toMatch(rules.valid);
      }
    }
  });

  it("never repeats or returns the original", () => {
    const list = variations("nova");
    expect(new Set(list).size).toBe(list.length);
    expect(list).not.toContain("nova");
  });

  it("is deterministic", () => {
    expect(variations("lucid kestrel", "github")).toEqual(variations("lucid kestrel", "github"));
  });

  it("returns nothing for a name with no letters or numbers", () => {
    expect(variations("...")).toEqual([]);
  });
});
