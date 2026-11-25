import type { OptionValue } from "./types.ts";

/**
 * "What are you naming?" — the guided start. Each preset picks a generator and
 * sets the options that suit that job, so people don't have to understand every
 * option before getting a good result.
 */
export interface Preset {
  id: string;
  title: string;
  /** Short line under the title. */
  hint: string;
  /** Icon name from src/ui/icons.ts. */
  icon: string;
  /** The card's own ink colour, from the rose-and-plum family. */
  tone: string;
  generatorId: string;
  options: Record<string, OptionValue>;
  /** Example output, shown on the card so people know what they'll get. */
  example: string;
}

export const PRESETS: readonly Preset[] = [
  { id: "instagram", title: "Instagram handle", hint: "Up to 30, follows the rules", icon: "camera", tone: "#b5476f", generatorId: "username", options: { platform: "instagram", style: "professional" }, example: "vesper.flux" },
  { id: "github", title: "GitHub username", hint: "Clean, hyphen-friendly", icon: "code", tone: "#4c3a78", generatorId: "username", options: { platform: "github", separator: "hyphen", style: "professional" }, example: "lucid-kestrel" },
  { id: "gamer", title: "Gamer tag", hint: "Bold and memorable", icon: "gamepad", tone: "#6b4c9a", generatorId: "username", options: { style: "gamer", platform: "x" }, example: "ShadowVex_99" },
  { id: "startup", title: "Startup or app", hint: "Brandable, invented words", icon: "rocket", tone: "#c0577a", generatorId: "project-name", options: { technique: "invented", caseStyle: "pascal" }, example: "Vespyra" },
  { id: "desi", title: "Desi brand", hint: "Hindi + English mix", icon: "store", tone: "#9d3c5e", generatorId: "project-name", options: { technique: "hinglish", caseStyle: "title" }, example: "Form Saathi" },
  { id: "repo", title: "Code repository", hint: "kebab-case, two words", icon: "branch", tone: "#3d5f7a", generatorId: "project-name", options: { technique: "compound", caseStyle: "kebab" }, example: "code-forge" },
  { id: "team", title: "Hackathon team", hint: "Shaped by team size", icon: "users", tone: "#8e4d7a", generatorId: "team-name", options: { theme: "tech", members: 4, useCount: true }, example: "Quantum Quartet" },
  { id: "character", title: "Story character", hint: "New names that sound real", icon: "book", tone: "#7a3e5d", generatorId: "person-name", options: { rarity: "invented", format: "full" }, example: "Nehita Varma" },
  { id: "testdata", title: "Test personas", hint: "Name, handle and safe email", icon: "database", tone: "#4f6b5e", generatorId: "persona", options: {}, example: "Thea Ashford" },
  { id: "password", title: "Strong password", hint: "Never saved anywhere", icon: "lock", tone: "#3b3f6b", generatorId: "password", options: { length: 20 }, example: "kV2p#jX$4Jx…" },
];

export const findPreset = (id: string) => PRESETS.find(p => p.id === id);
