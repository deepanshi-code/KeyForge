import { cleanWord } from "../core/text.ts";
import type { Generator } from "../core/types.ts";
import { personNameGenerator } from "./person-name.ts";
import { usernameGenerator } from "./username.ts";

export type PersonaOptions = {
  region: string;
  gender: string;
  rarity: string;
  style: string;
};

/**
 * A complete fake identity, built by combining other generators — the point
 * of having them all on one platform. Emails use example.com, a domain
 * reserved for documentation and testing (RFC 2606), so they can never
 * reach a real inbox.
 */
export const personaGenerator: Generator<PersonaOptions> = {
  id: "persona",
  name: "Persona",
  icon: "layers",
  description: "A complete fake identity for mock-ups and test data: name, matching username and a safe example.com email.",
  sensitive: false,
  fields: [
    personNameGenerator.fields.find(f => f.key === "region")!,
    personNameGenerator.fields.find(f => f.key === "gender")!,
    personNameGenerator.fields.find(f => f.key === "rarity")!,
    usernameGenerator.fields.find(f => f.key === "style")!,
  ],
  defaults: { region: "any", gender: "any", rarity: "uncommon", style: "professional" },

  generate(opts, rng) {
    const fullName = personNameGenerator.generate(
      { region: opts.region, gender: opts.gender, rarity: opts.rarity, format: "full" }, rng,
    );
    const [first, last] = fullName.split(" ");
    const username = usernameGenerator.generate(
      { ...usernameGenerator.defaults, style: opts.style, name: first, maxLength: 20 }, rng,
    );
    const email = `${cleanWord(first)}.${cleanWord(last)}@example.com`;
    return `${fullName} · @${username} · ${email}`;
  },
};
