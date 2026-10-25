import type { Generator } from "./types.ts";
import { usernameGenerator } from "../generators/username.ts";
import { projectNameGenerator } from "../generators/project-name.ts";
import { teamNameGenerator } from "../generators/team-name.ts";
import { personNameGenerator } from "../generators/person-name.ts";
import { personaGenerator } from "../generators/persona.ts";
import { passwordGenerator } from "../generators/password.ts";

/**
 * Every generator in the app, in menu order. To add one: create it in
 * src/generators/, add a test next to it, and list it here. Nothing else changes.
 */
export const GENERATORS: readonly Generator[] = [
  usernameGenerator,
  projectNameGenerator,
  teamNameGenerator,
  personNameGenerator,
  personaGenerator,
  passwordGenerator,
];

export function findGenerator(id: string): Generator | undefined {
  return GENERATORS.find(g => g.id === id);
}
