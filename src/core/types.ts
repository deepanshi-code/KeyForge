import type { Rng } from "./rng.ts";

export type OptionValue = string | number | boolean;

/**
 * A generator's options object. Each generator declares its own options as a
 * `type` alias (not an `interface`), because only type aliases are assignable
 * to this index-signature type.
 */
export type Options = Record<string, OptionValue>;

interface FieldBase {
  key: string;
  label: string;
  help?: string;
}

export interface NumberField extends FieldBase {
  kind: "number";
  min: number;
  max: number;
}

export interface BooleanField extends FieldBase {
  kind: "boolean";
}

export interface SelectField extends FieldBase {
  kind: "select";
  choices: { value: string; label: string }[];
}

export interface TextField extends FieldBase {
  kind: "text";
  placeholder?: string;
  maxLength: number;
}

/** Describes one option. The UI builds its form from these automatically. */
export type OptionField = NumberField | BooleanField | SelectField | TextField;

/** Extra info shown under a result, e.g. password strength. */
export interface ResultNote {
  text: string;
  /** 0–1: fills a meter bar (e.g. strength). */
  meter?: number;
  /** Colours the meter: 0 = bad … 3 = excellent. */
  tone?: 0 | 1 | 2 | 3;
}

/**
 * The contract every generator follows. Adding a generator = writing one
 * object that satisfies this interface and registering it in registry.ts.
 */
export interface Generator<O extends Options = Options> {
  id: string;
  name: string;
  /** Icon name from src/ui/icons.ts, shown in the generator menu. */
  icon: string;
  description: string;
  /** Secret output: always uses secureRng and is never saved to history/favourites. */
  sensitive: boolean;
  fields: OptionField[];
  defaults: O;
  /**
   * Rules that involve more than one field (single-field ranges are checked
   * automatically from `fields`). Return an error message, or null if valid.
   */
  validate?(opts: O): string | null;
  generate(opts: O, rng: Rng): string;
  /** Optional note shown under each result, e.g. strength. null = nothing to say for this one. */
  describe?(value: string, opts: O): ResultNote | null;
}

/** Thrown when valid options still can't produce a result (e.g. too-short max length). */
export class GenerationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GenerationError";
  }
}
