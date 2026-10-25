import { trainModel, type WordModel } from "../core/markov.ts";
import { capitalize } from "../core/text.ts";
import { GenerationError, type Generator } from "../core/types.ts";
import {
  INDIAN_FEMALE, INDIAN_FEMALE_UNCOMMON, INDIAN_MALE, INDIAN_MALE_UNCOMMON, INDIAN_SURNAMES,
  INDIAN_SURNAMES_UNCOMMON, INTL_FEMALE, INTL_FEMALE_UNCOMMON, INTL_MALE, INTL_MALE_UNCOMMON,
  INTL_SURNAMES, INTL_SURNAMES_UNCOMMON,
} from "../data/names.ts";

export type PersonNameOptions = {
  region: string;
  gender: string;
  rarity: string;
  format: string;
};

interface NameLists {
  common: readonly string[];
  uncommon: readonly string[];
}

const REGIONS: Record<string, { female: NameLists; male: NameLists; surnames: NameLists }> = {
  indian: {
    female: { common: INDIAN_FEMALE, uncommon: INDIAN_FEMALE_UNCOMMON },
    male: { common: INDIAN_MALE, uncommon: INDIAN_MALE_UNCOMMON },
    surnames: { common: INDIAN_SURNAMES, uncommon: INDIAN_SURNAMES_UNCOMMON },
  },
  international: {
    female: { common: INTL_FEMALE, uncommon: INTL_FEMALE_UNCOMMON },
    male: { common: INTL_MALE, uncommon: INTL_MALE_UNCOMMON },
    surnames: { common: INTL_SURNAMES, uncommon: INTL_SURNAMES_UNCOMMON },
  },
};

/** One Markov model per region + gender, trained the first time it's needed. */
const models = new Map<string, WordModel>();
function modelFor(key: string, lists: NameLists): WordModel {
  let model = models.get(key);
  if (!model) {
    model = trainModel([...lists.common, ...lists.uncommon]);
    models.set(key, model);
  }
  return model;
}

export const personNameGenerator: Generator<PersonNameOptions> = {
  id: "person-name",
  name: "Person name",
  icon: "id-card",
  description: "Names for characters, mock-ups and test data — from rare real names to brand-new ones.",
  sensitive: false,
  fields: [
    {
      kind: "select", key: "region", label: "Region",
      choices: [
        { value: "any", label: "Any" },
        { value: "indian", label: "Indian" },
        { value: "international", label: "International" },
      ],
    },
    {
      kind: "select", key: "gender", label: "Gender",
      choices: [
        { value: "any", label: "Any" },
        { value: "female", label: "Female" },
        { value: "male", label: "Male" },
      ],
    },
    {
      kind: "select", key: "rarity", label: "Rarity",
      choices: [
        { value: "common", label: "Common" },
        { value: "uncommon", label: "Uncommon" },
        { value: "invented", label: "Invented" },
      ],
      help: "Invented first names are new names that sound like real ones from the region.",
    },
    {
      kind: "select", key: "format", label: "Format",
      choices: [
        { value: "full", label: "Full name" },
        { value: "first", label: "First name" },
      ],
    },
  ],
  defaults: { region: "any", gender: "any", rarity: "uncommon", format: "full" },

  generate(opts, rng) {
    const regionKey = opts.region === "any" ? rng.pick(Object.keys(REGIONS)) : opts.region;
    const region = REGIONS[regionKey];
    if (!region) throw new GenerationError(`Unknown region "${opts.region}".`);

    const gender = opts.gender === "any" ? (rng.chance(0.5) ? "female" : "male") : opts.gender;
    const firstLists = gender === "female" ? region.female : region.male;

    let first: string;
    if (opts.rarity === "invented") {
      const invented = modelFor(`${regionKey}-${gender}`, firstLists).generate(rng, 4, 9);
      if (!invented) throw new GenerationError("Couldn't invent a name. Try again.");
      first = invented;
    } else {
      first = rng.pick(opts.rarity === "common" ? firstLists.common : firstLists.uncommon);
    }

    if (opts.format === "first") return capitalize(first);
    const surnames = opts.rarity === "common" ? region.surnames.common : region.surnames.uncommon;
    return `${capitalize(first)} ${capitalize(rng.pick(surnames))}`;
  },
};
