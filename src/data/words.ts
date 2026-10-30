import { unique } from "../core/text.ts";

// Hand-written word lists: lowercase, family-friendly.
// `unique()` guards against accidental duplicates when lists are edited.

// ---- Familiar words (the "Familiar" uniqueness level) ----

export const ADJECTIVES = unique([
  "agile", "amber", "ancient", "arctic", "azure", "bold", "brave", "bright", "brisk", "calm",
  "clever", "cosmic", "crimson", "crisp", "curious", "daring", "dashing", "digital", "eager", "electric",
  "elegant", "epic", "fearless", "fierce", "flying", "fresh", "frosty", "gentle", "giant", "golden",
  "grand", "hidden", "honest", "icy", "jolly", "keen", "lively", "loyal", "lucky", "lunar",
  "magic", "mighty", "misty", "modern", "noble", "nimble", "polar", "prime", "proud", "quick",
  "quiet", "rapid", "royal", "rustic", "scarlet", "secret", "shiny", "silent", "silver", "sleek",
  "smart", "snowy", "solar", "sonic", "speedy", "steady", "stellar", "stormy", "sunny", "swift",
  "turbo", "ultra", "urban", "valiant", "vivid", "wild", "wise", "witty", "zesty", "blazing",
  "breezy", "dreamy", "dynamic", "glowing", "hyper", "mystic", "radiant", "rugged", "stealthy", "sublime",
]);

export const NOUNS = unique([
  "anchor", "arrow", "atlas", "aurora", "badger", "beacon", "bison", "blaze", "breeze", "canyon",
  "castle", "cedar", "cipher", "cloud", "cobalt", "comet", "compass", "coral", "crane", "dawn",
  "delta", "dolphin", "dragon", "eagle", "echo", "ember", "falcon", "fern", "forest", "fox",
  "galaxy", "glacier", "griffin", "harbor", "hawk", "heron", "horizon", "island", "jaguar", "kite",
  "koala", "lagoon", "lantern", "legend", "lotus", "lynx", "maple", "meadow", "meteor", "monsoon",
  "nebula", "oasis", "ocean", "opal", "orbit", "orchid", "otter", "owl", "panda", "panther",
  "phoenix", "pilot", "planet", "prism", "pulse", "quartz", "quest", "raven", "reef", "river",
  "rocket", "rover", "ruby", "shadow", "shark", "signal", "spark", "sparrow", "sphinx", "storm",
  "summit", "swan", "thunder", "tiger", "torch", "trail", "vector", "voyage", "whale", "willow",
  "wolf", "zenith", "zephyr",
]);

// ---- Rare words (the "Rare" uniqueness level) ----

export const RARE_ADJECTIVES = unique([
  "arcane", "astral", "blithe", "boreal", "celestial", "cerulean", "cryptic", "dulcet", "eldritch", "elusive",
  "ethereal", "feral", "fervent", "gilded", "gossamer", "halcyon", "hollow", "iridescent", "kinetic", "liminal",
  "lucent", "luminous", "lucid", "mercurial", "mythic", "nebular", "nocturnal", "obsidian", "opaline", "ornate",
  "phantom", "primal", "quantum", "runic", "sable", "sapphire", "sentient", "serene", "silken", "spectral",
  "sylvan", "tidal", "umbral", "velvet", "verdant", "vesper", "volcanic", "wandering", "wistful", "zealous",
  "aurous", "cobalt", "frostbound", "galactic", "hallowed", "infinite", "jovial", "lunaris", "molten", "neon",
  "onyx", "prismatic", "radiant", "starlit", "stormborn", "twilit", "unbound", "vagrant", "woven", "xenial",
]);

export const RARE_NOUNS = unique([
  "axolotl", "basilisk", "chimera", "cinder", "corvid", "cosmos", "dynamo", "eclipse", "equinox", "fjord",
  "flux", "galleon", "glyph", "golem", "harbinger", "helix", "kestrel", "kraken", "labyrinth", "meridian",
  "mirage", "monolith", "narwhal", "nomad", "oracle", "osprey", "paradox", "pulsar", "quasar", "quill",
  "raptor", "relic", "riddle", "rune", "saga", "sentinel", "spire", "sprite", "tempest", "thistle",
  "totem", "tundra", "valkyrie", "vortex", "warden", "wisp", "wyvern", "ocelot", "tanuki", "pangolin",
  "quokka", "marmot", "ibis", "magpie", "citadel", "obelisk", "solstice", "nimbus", "aether", "comet",
  "ember", "halo", "lyre", "nova", "orca", "sable", "tundra", "vesper", "willowisp", "zenith",
]);

/**
 * Training words for the Markov model ("Invented" level): mythic, celestial
 * and natural names. Invented words sound like these without being any of them.
 */
export const MYTHIC_WORDS = unique([
  "aurora", "zephyr", "nebula", "lumina", "solace", "vesper", "astra", "orion", "lyra", "nova",
  "elara", "kaida", "zenith", "quasar", "ember", "cinder", "halcyon", "seraph", "aether", "sylph",
  "nimbus", "cirrus", "onyx", "obsidian", "indigo", "saffron", "juniper", "willow", "aspen", "cedar",
  "rowan", "sorrel", "thistle", "fennel", "amber", "jasper", "opal", "beryl", "garnet", "topaz",
  "zircon", "lapis", "coral", "kestrel", "merlin", "osprey", "raven", "lynx", "ocelot", "kodiak",
  "orca", "narwhal", "vortex", "cipher", "nexus", "vertex", "helix", "prism", "pulsar", "photon",
  "arcadia", "avalon", "elysium", "olympus", "atlas", "titan", "hyperion", "rhea", "selene", "helios",
  "nyx", "erebus", "chronos", "kairos", "boreas", "xanadu", "solstice", "equinox", "eclipse", "meridian",
  "horizon", "tempest", "monsoon", "mistral", "sirocco", "glacier", "tundra", "sierra", "fjord", "lagoon",
  "calyx", "elowen", "isolde", "oberon", "lorien", "valora", "zarya", "kalista", "soren", "talon",
  "veyra", "corvin", "lucan", "mirelle", "nerissa", "ondine", "peregrine", "quillon", "riven", "sablea",
  "thalia", "umbra", "vireo", "wrenna", "xyla", "yara", "zoltan", "aurelia", "briar", "caelum",
]);

// ---- Style-specific words ----

export const CUTE_ADJECTIVES = unique([
  "bubbly", "fluffy", "fuzzy", "cozy", "sweet", "sleepy", "peachy", "rosy", "snuggly", "tiny",
  "sunny", "sparkly", "cuddly", "dreamy", "bouncy", "honey", "minty", "comfy", "velvet", "starry",
]);

export const CUTE_NOUNS = unique([
  "panda", "bunny", "kitten", "puppy", "cupcake", "muffin", "mochi", "boba", "cookie", "peach",
  "cherry", "berry", "daisy", "koala", "otter", "penguin", "duckling", "bean", "cloud", "pudding",
  "waffle", "sprout", "button", "pebble", "dumpling", "hamster", "bubble", "biscuit", "quokka", "macaron",
]);

/** Endings that make an invented or real word sound cute: "lumie", "kiboo". */
export const CUTE_ENDINGS = ["ie", "y", "oo", "bean", "pop", "bun", "kins", "ling"];

export const GAMER_PREFIXES = unique([
  "shadow", "dark", "neo", "xeno", "cyber", "hyper", "toxic", "savage", "rogue", "ghost",
  "venom", "frost", "blaze", "storm", "night", "steel", "iron", "chaos", "nova", "void",
  "alpha", "omega", "turbo", "ninja", "pixel", "glitch", "rapid", "phantom", "crimson", "atomic",
]);

export const RARE_GAMER_PREFIXES = unique([
  "umbral", "eldritch", "spectral", "obsidian", "feral", "runic", "astral", "abyssal", "molten", "stormborn",
  "nether", "hex", "zero", "null", "vanta", "kryo", "lunar", "solar", "onyx", "riftborn",
]);

export const GAMER_NOUNS = unique([
  "reaper", "slayer", "hunter", "striker", "viper", "raider", "knight", "sniper", "wraith", "titan",
  "ranger", "ronin", "samurai", "warlock", "blade", "fang", "legend", "beast", "rogue", "spectre",
  "nomad", "outlaw", "maverick", "cyclone", "rider", "revenant", "warden", "kraken", "wyvern", "basilisk",
]);

/** Gamer-style endings for invented words: "vorinx", "kaelz". */
export const GAMER_ENDINGS = ["x", "z", "ix", "yx", "on", "ex"];

export const PRO_SUFFIXES = unique([
  "dev", "codes", "builds", "designs", "writes", "hq", "labs", "works", "studio", "io",
  "creates", "makes", "ships", "thinks", "crafts",
]);

/** Modern handle patterns around a name: "itsdeepa", "deepa.irl", "builtbydeepa". */
export const NAME_PREFIXES = ["its", "hey", "the", "builtby", "just", "hello", "iam", "real", "notjust", "only"];
export const NAME_SUFFIXES = ["irl", "codes", "verse", "hq", "online", "world", "zone", "space", "loop", "wave"];

/** Endings that morph a name into something new: "deepa" → "deepyx", "deepora". */
export const NAME_MORPH_ENDINGS = ["yx", "ora", "ix", "io", "ex", "yn", "ara", "elle", "ion", "iva", "orra", "en"];

// ---- Project names ----

export const TECH_WORDS = unique([
  "byte", "cloud", "code", "data", "pixel", "stack", "logic", "grid", "node", "flow",
  "sync", "link", "mesh", "core", "spark", "forge", "pulse", "vault", "wave", "orbit",
  "beam", "bit", "cache", "cipher", "circuit", "echo", "frame", "hub", "kernel", "layer",
  "loop", "matrix", "metric", "nexus", "packet", "path", "query", "quantum", "relay", "scope",
  "script", "shift", "signal", "sketch", "socket", "sprint", "stream", "task", "thread", "token",
  "trace", "vector", "vertex", "vision", "volt", "zen", "note", "mind", "shelf", "track",
  "plan", "learn", "bloom", "craft", "nest", "lens", "atlas", "pilot", "compass", "lumen",
]);

export const PROJECT_PREFIXES = unique([
  "neo", "omni", "hyper", "meta", "ultra", "open", "smart", "deep", "true", "bright",
  "micro", "nano", "poly", "auto", "zen", "astro", "echo", "flux", "nova", "terra",
]);

export const PROJECT_SUFFIXES = unique([
  "ify", "ly", "io", "hub", "lab", "kit", "stack", "forge", "verse", "base",
  "flow", "wise", "works", "desk", "mate", "nest", "scape", "sphere", "ora", "ium",
]);

/** Latin/Greek-flavoured roots for "classic" project names. */
export const CLASSIC_ROOTS = unique([
  "lumen", "nova", "astra", "terra", "aqua", "vita", "lux", "sol", "luna", "nexus",
  "axis", "vera", "opus", "aether", "helio", "chrono", "logos", "mythos", "kosmos", "aero",
  "gnosis", "cura", "fides", "magna", "ignis", "orbis", "vox", "codex", "atrium", "nimbus",
]);

// ---- Team names ----

export const TEAM_THEMES: Record<string, readonly string[]> = {
  tech: unique([
    "coders", "hackers", "builders", "makers", "debuggers", "compilers", "pixels", "bytes", "bots", "nodes",
    "wizards", "ninjas", "pioneers", "architects", "engineers", "innovators", "algorithms", "circuits", "kernels", "commits",
  ]),
  sports: unique([
    "tigers", "wolves", "eagles", "sharks", "falcons", "panthers", "lions", "hawks", "bulls", "stallions",
    "titans", "warriors", "rangers", "raiders", "spartans", "gladiators", "cobras", "jaguars", "rhinos", "vipers",
  ]),
  esports: unique([
    "reapers", "wraiths", "ronins", "specters", "outlaws", "mavericks", "glitches", "snipers", "phantoms", "renegades",
    "rogues", "nomads", "revenants", "vandals", "strikers", "berserkers", "hexers", "ravagers", "drifters", "invokers",
  ]),
  space: unique([
    "astronauts", "comets", "pulsars", "quasars", "voyagers", "orbiters", "cosmonauts", "meteors", "stargazers", "novas",
    "rockets", "satellites", "nebulae", "photons", "eclipses", "asteroids", "starships", "galaxies", "moonwalkers", "skyfarers",
  ]),
  mythology: unique([
    "titans", "valkyries", "krakens", "griffins", "phoenixes", "centaurs", "oracles", "sphinxes", "minotaurs", "dragons",
    "wyverns", "chimeras", "sirens", "spartans", "pegasi", "hydras", "basilisks", "argonauts", "olympians", "druids",
  ]),
  general: unique([
    "pirates", "crusaders", "mavericks", "voyagers", "knights", "legends", "rockets", "rebels", "dreamers", "explorers",
    "guardians", "pathfinders", "trailblazers", "nomads", "comets", "giants", "sparks", "wanderers", "alchemists", "mavens",
  ]),
};

export const TEAM_COLLECTIVES = unique([
  "brigade", "squad", "syndicate", "collective", "alliance", "crew", "league", "guild", "legion", "society",
  "club", "tribe", "union", "dynasty", "battalion", "circle", "council", "fleet", "order", "pack",
]);

/**
 * Words for a team of N people, used when the member count shapes the name.
 * `of` lists the group nouns that read well as "<Group> of <Plural>" ("Trio of Titans").
 */
export const TEAM_SIZE_WORDS: Record<number, { group: string[]; of: string[]; number: string; prefix: string; roman: string }> = {
  2: { group: ["duo", "tandem", "pair"], of: ["duo", "pair", "tandem"], number: "two", prefix: "bi", roman: "II" },
  3: { group: ["trio", "trinity", "triad"], of: ["trio", "trinity", "triad"], number: "three", prefix: "tri", roman: "III" },
  4: { group: ["quartet", "quad", "quadrant"], of: ["quartet"], number: "four", prefix: "tetra", roman: "IV" },
  5: { group: ["quintet", "pentad", "five"], of: ["quintet"], number: "five", prefix: "penta", roman: "V" },
  6: { group: ["sextet", "six", "hexad"], of: ["sextet"], number: "six", prefix: "hexa", roman: "VI" },
  7: { group: ["septet", "seven", "heptad"], of: ["septet"], number: "seven", prefix: "hepta", roman: "VII" },
  8: { group: ["octet", "eight", "octave"], of: ["octet"], number: "eight", prefix: "octa", roman: "VIII" },
  9: { group: ["nonet", "nine", "ennead"], of: ["nonet"], number: "nine", prefix: "nona", roman: "IX" },
  10: { group: ["decade", "ten", "decet"], of: [], number: "ten", prefix: "deca", roman: "X" },
  11: { group: ["eleven"], of: [], number: "eleven", prefix: "hendeca", roman: "XI" },
  12: { group: ["dozen", "twelve"], of: [], number: "twelve", prefix: "dodeca", roman: "XII" },
};

/**
 * Common Hindi words in Roman script, with plain English meanings, for
 * Hinglish names like "FormSaathi". Hand-picked: well known, positive, and
 * easy to spell. Words that hide inside common English words ("chai" in
 * "chain", "desi" in "design") are left out so meanings aren't shown wrongly.
 */
export const HINDI_WORDS: Readonly<Record<string, string>> = {
  saathi: "companion", dost: "friend", mitra: "friend", yatra: "journey", safar: "journey",
  raah: "path", disha: "direction", manzil: "destination", udaan: "flight", sapna: "dream",
  kaam: "work", seva: "service", sahayak: "helper", sutra: "formula", gyaan: "knowledge",
  vidya: "learning", shiksha: "education", pustak: "book", kosh: "treasury", nidhi: "treasure",
  dhan: "wealth", bachat: "savings", hisaab: "accounts", khata: "ledger", vyapar: "trade",
  bazaar: "market", dukaan: "shop", mandi: "market", ghar: "home", parivar: "family",
  rasoi: "kitchen", arogya: "health", sangam: "confluence", manch: "platform", tarang: "wave",
  roshni: "light", jyoti: "flame", shakti: "strength", jugaad: "clever fix", suchna: "information",
  sanchar: "communication", naya: "new", asaan: "easy", pakka: "for sure", apna: "our own",
  kisan: "farmer", shaadi: "wedding", khel: "game", sangeet: "music", kala: "art",
};

/** Hindi describing words: they go first, like "Apna Shop", "Asaan Form". */
export const HINDI_ADJECTIVES = ["naya", "asaan", "pakka", "apna"] as const;

/** English things a product is about: "Form Saathi", "Study Dost", "Apna Shop". */
export const HINGLISH_THINGS = unique([
  "form", "book", "study", "task", "note", "track", "ride", "shop", "chat", "fit",
  "cook", "home", "care", "desk", "cart", "exam", "job", "trip", "money", "health",
]);

/** English product endings that follow a Hindi word: "Dukaan Pay", "Yatra Hub". */
export const HINGLISH_ENDINGS = unique([
  "hub", "box", "pro", "pay", "go", "kit", "plus", "lab", "zone", "point", "link", "app", "cloud", "flow",
]);
