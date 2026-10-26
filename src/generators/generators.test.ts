import { describe, expect, it } from "vitest";
import { chosenPasswordStrength } from "../core/entropy.ts";
import { seededRng } from "../core/rng.ts";
import { GenerationError } from "../core/types.ts";
import { validateOptions } from "../core/validate.ts";
import {
  INDIAN_FEMALE, INDIAN_FEMALE_UNCOMMON, INDIAN_SURNAMES_UNCOMMON, INTL_MALE, INTL_MALE_UNCOMMON,
} from "../data/names.ts";
import { ADJECTIVES, MYTHIC_WORDS, NOUNS, TEAM_SIZE_WORDS, TEAM_THEMES } from "../data/words.ts";
import { passwordGenerator, type PasswordOptions } from "./password.ts";
import { personNameGenerator } from "./person-name.ts";
import { blend, projectNameGenerator } from "./project-name.ts";
import { teamNameGenerator } from "./team-name.ts";
import { PLATFORMS, usernameGenerator } from "./username.ts";

const many = (n: number, fn: () => string) => Array.from({ length: n }, fn);

describe("password", () => {
  const base: PasswordOptions = { ...passwordGenerator.defaults };

  it("has exactly the requested length", () => {
    const rng = seededRng("len");
    for (const length of [4, 8, 16, 64, 128]) {
      expect(passwordGenerator.generate({ ...base, length }, rng)).toHaveLength(length);
    }
  });

  it("always includes every selected type, even at minimum length", () => {
    const rng = seededRng("types");
    for (const pw of many(2000, () => passwordGenerator.generate({ ...base, length: 4 }, rng))) {
      expect(pw).toMatch(/[A-Z]/);
      expect(pw).toMatch(/[a-z]/);
      expect(pw).toMatch(/[0-9]/);
      expect(pw).toMatch(/[^A-Za-z0-9]/);
    }
  });

  it("uses only the selected types", () => {
    const rng = seededRng("digits");
    const opts = { ...base, upper: false, lower: false, symbols: false };
    for (const pw of many(200, () => passwordGenerator.generate(opts, rng))) expect(pw).toMatch(/^[0-9]+$/);
  });

  it("can avoid look-alike characters", () => {
    const rng = seededRng("ambiguous");
    const opts = { ...base, length: 64, excludeAmbiguous: true };
    for (const pw of many(300, () => passwordGenerator.generate(opts, rng))) expect(pw).not.toMatch(/[Il1O0o]/);
  });

  it("requires at least one character type", () => {
    const none = { ...base, upper: false, lower: false, numbers: false, symbols: false };
    expect(validateOptions(passwordGenerator, none)).toMatch(/at least one/);
  });

  it("reports entropy and a strength meter", () => {
    // 26 + 26 + 10 + 13 symbols = 75 characters; 16 × log2(75) ≈ 99.7 bits.
    const strong = passwordGenerator.describe!("", base);
    expect(strong.text).toBe("Very strong · ~100 bits of entropy");
    expect(strong.tone).toBe(3);
    expect(strong.meter).toBeCloseTo(99.66 / 128, 2);

    const weak = passwordGenerator.describe!("", { ...base, length: 6, upper: false, symbols: false, numbers: false });
    expect(weak.text).toMatch(/^Weak/);
    expect(weak.tone).toBe(0);
  });
});

describe("username", () => {
  const base = { ...usernameGenerator.defaults };

  it("respects max length in every style and uniqueness level", () => {
    for (const style of ["professional", "gamer", "minimal", "cute"]) {
      for (const uniqueness of ["familiar", "rare", "invented"]) {
        const rng = seededRng(style + uniqueness);
        const opts = { ...base, style, uniqueness, maxLength: 10, numbers: true };
        for (const u of many(150, () => usernameGenerator.generate(opts, rng))) {
          expect(u.length).toBeLessThanOrEqual(10);
          expect(u.length).toBeGreaterThanOrEqual(3);
        }
      }
    }
  });

  it("follows each platform's rules", () => {
    for (const [id, platform] of Object.entries(PLATFORMS)) {
      for (const separator of ["none", "underscore", "dot", "hyphen"]) {
        const rng = seededRng(id + separator);
        const opts = { ...base, platform: id, separator, numbers: true, maxLength: 39 };
        for (const u of many(80, () => usernameGenerator.generate(opts, rng))) {
          expect(u.length).toBeLessThanOrEqual(platform.max);
          expect(u.length).toBeGreaterThanOrEqual(platform.min);
          expect(u).toMatch(platform.valid);
        }
      }
    }
  });

  it("uses a hyphen on GitHub instead of an underscore", () => {
    const rng = seededRng("gh");
    const names = many(50, () => usernameGenerator.generate({ ...base, platform: "github", separator: "underscore" }, rng));
    expect(names.some(u => u.includes("-"))).toBe(true);
    expect(names.every(u => !u.includes("_"))).toBe(true);
  });

  it("builds around the user's first name", () => {
    for (const style of ["professional", "gamer"]) {
      const rng = seededRng(style);
      const opts = { ...base, style, name: "Deepa Sharma", maxLength: 30 };
      for (const u of many(100, () => usernameGenerator.generate(opts, rng))) expect(u).toContain("deepa");
    }
  });

  it("morphs the name into something new when invented", () => {
    const rng = seededRng("morph");
    const opts = { ...base, uniqueness: "invented", name: "Deepa", maxLength: 30 };
    const names = many(100, () => usernameGenerator.generate(opts, rng));
    expect(names.every(u => u.includes("deep"))).toBe(true);
    expect(names.some(u => !u.includes("deepa"))).toBe(true); // e.g. "deepyx"
  });

  it("rare level avoids everyday words", () => {
    const rng = seededRng("rare");
    const everyday = new Set([...ADJECTIVES, ...NOUNS]);
    const opts = { ...base, uniqueness: "rare", separator: "underscore" };
    const names = many(200, () => usernameGenerator.generate(opts, rng));
    const allEveryday = names.filter(u => u.split("_").every(part => everyday.has(part)));
    expect(allEveryday.length).toBeLessThan(20);
  });

  it("ends with two digits when numbers are on", () => {
    const rng = seededRng("nums");
    for (const u of many(100, () => usernameGenerator.generate({ ...base, numbers: true, maxLength: 30 }, rng))) {
      expect(u).toMatch(/[a-z][1-9][0-9]$/);
    }
  });

  it("works for names that contain a blocked substring (Scunthorpe problem)", () => {
    const rng = seededRng("ishita");
    const opts = { ...base, uniqueness: "familiar", name: "Ishita", maxLength: 30 };
    expect(usernameGenerator.generate(opts, rng)).toContain("ishita");
  });

  it("explains when nothing fits", () => {
    const opts = { ...base, name: "Bartholomew", maxLength: 6 };
    expect(() => usernameGenerator.generate(opts, seededRng("fit"))).toThrow(GenerationError);
  });
});

describe("project name", () => {
  it("blends words on a shared letter", () => {
    expect(blend("cloud", "data")).toBe("cloudata");
    expect(blend("spark", "kernel")).toBe("sparkernel");
    expect(blend("byte", "echo")).toBe("bytecho");
    expect(blend("zzz", "abc")).toBeNull();
  });

  it("formats kebab-case for repo names", () => {
    const rng = seededRng("kebab");
    const opts = { ...projectNameGenerator.defaults, caseStyle: "kebab" };
    for (const n of many(300, () => projectNameGenerator.generate(opts, rng))) expect(n).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
  });

  it("uses the user's keywords often", () => {
    const rng = seededRng("kw");
    const opts = { keywords: "notes", technique: "compound", caseStyle: "lower" };
    const names = many(300, () => projectNameGenerator.generate(opts, rng));
    expect(names.filter(n => n.includes("notes")).length).toBeGreaterThan(150);
  });

  it("invents brand-new words", () => {
    const rng = seededRng("invent");
    const known = new Set(MYTHIC_WORDS);
    const opts = { keywords: "", technique: "invented", caseStyle: "lower" };
    for (const n of many(200, () => projectNameGenerator.generate(opts, rng))) expect(known.has(n)).toBe(false);
  });
});

describe("team name", () => {
  const base = { ...teamNameGenerator.defaults };

  it("alliterates when asked (without member count)", () => {
    const rng = seededRng("allit");
    const opts = { ...base, useCount: false, alliterate: true, uniqueness: "familiar" };
    for (const n of many(300, () => teamNameGenerator.generate(opts, rng))) {
      const [a, b] = n.split(" ");
      expect(a[0]).toBe(b[0]);
    }
  });

  it("uses the chosen theme's words", () => {
    const rng = seededRng("space");
    const opts = { ...base, theme: "space", useCount: false, alliterate: false };
    for (const n of many(200, () => teamNameGenerator.generate(opts, rng))) {
      const last = n.split(" ").at(-1)!.toLowerCase();
      expect(TEAM_THEMES.space).toContain(last);
    }
  });

  it("works the member count into the name", () => {
    for (let members = 2; members <= 12; members++) {
      const size = TEAM_SIZE_WORDS[members];
      const sizeWords = [...size.group, size.number, size.prefix].map(w => w.toLowerCase());
      const rng = seededRng(`members-${members}`);
      const opts = { ...base, members, useCount: true };
      for (const n of many(100, () => teamNameGenerator.generate(opts, rng))) {
        const words = n.split(" ");
        const mentionsSize = words.includes(size.roman) || words.some(w => sizeWords.includes(w.toLowerCase()));
        expect(mentionsSize, `"${n}" should mention a team of ${members}`).toBe(true);
      }
    }
  });

  it("never throws for any theme, size and option combination", () => {
    const rng = seededRng("combos");
    for (const theme of Object.keys(TEAM_THEMES)) {
      for (const members of [2, 5, 11, 12]) {
        for (const uniqueness of ["familiar", "rare", "invented"]) {
          const opts = { theme, members, useCount: true, uniqueness, alliterate: true };
          expect(teamNameGenerator.generate(opts, rng).length).toBeGreaterThan(0);
        }
      }
    }
  });
});

describe("person name", () => {
  it("respects region, gender and rarity", () => {
    const rng = seededRng("person");
    const opts = { region: "indian", gender: "female", rarity: "uncommon", format: "full" };
    for (const n of many(200, () => personNameGenerator.generate(opts, rng))) {
      const [first, last] = n.toLowerCase().split(" ");
      expect(INDIAN_FEMALE_UNCOMMON).toContain(first);
      expect(INDIAN_SURNAMES_UNCOMMON).toContain(last);
    }
  });

  it("uses popular names for the common level", () => {
    const rng = seededRng("common");
    const opts = { region: "indian", gender: "female", rarity: "common", format: "first" };
    for (const n of many(100, () => personNameGenerator.generate(opts, rng))) expect(INDIAN_FEMALE).toContain(n.toLowerCase());
  });

  it("invents first names that aren't in the lists", () => {
    const rng = seededRng("invented");
    const known = new Set([...INTL_MALE, ...INTL_MALE_UNCOMMON]);
    const opts = { region: "international", gender: "male", rarity: "invented", format: "first" };
    for (const n of many(200, () => personNameGenerator.generate(opts, rng))) {
      expect(n).toMatch(/^[A-Z][a-z]+$/);
      expect(known.has(n.toLowerCase())).toBe(false);
    }
  });
});

describe("persona", () => {
  it("combines a name, a matching username and a safe email", async () => {
    const { personaGenerator } = await import("./persona.ts");
    const rng = seededRng("persona");
    for (const p of many(100, () => personaGenerator.generate(personaGenerator.defaults, rng))) {
      const [name, handle, email] = p.split(" · ");
      const [first, last] = name.toLowerCase().split(" ");
      expect(handle.startsWith("@")).toBe(true);
      expect(email).toBe(`${first}.${last}@example.com`);
      // The username is built around the persona's first name.
      expect(handle.toLowerCase()).toContain(first.slice(0, 3));
    }
  });
});

describe("chosen password strength", () => {
  it("calls short and common passwords weak", () => {
    expect(chosenPasswordStrength("short").label).toBe("Weak");
    expect(chosenPasswordStrength("MyPassword99!").label).toBe("Weak");
  });

  it("rewards length and variety, and penalises repeats and runs", () => {
    expect(chosenPasswordStrength("lowercase").score).toBeLessThan(chosenPasswordStrength("Mixed-Case-9x!Words").score);
    expect(chosenPasswordStrength("Tr0ub4dor&3xyz").score).toBe(3);
    expect(chosenPasswordStrength("aaabbb12").score).toBeLessThan(2);
  });
});
