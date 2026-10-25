import type { Generator, Options } from "./types.ts";

/**
 * Checks every option against its field declaration, then runs the
 * generator's own cross-field rules. Returns the first error, or null.
 */
export function validateOptions<O extends Options>(gen: Generator<O>, opts: O): string | null {
  for (const field of gen.fields) {
    const value = opts[field.key];
    switch (field.kind) {
      case "number":
        if (typeof value !== "number" || !Number.isInteger(value) || value < field.min || value > field.max) {
          return `${field.label} must be a whole number from ${field.min} to ${field.max}.`;
        }
        break;
      case "boolean":
        if (typeof value !== "boolean") return `${field.label} must be on or off.`;
        break;
      case "select":
        if (!field.choices.some(c => c.value === value)) return `Choose a valid ${field.label.toLowerCase()}.`;
        break;
      case "text":
        if (typeof value !== "string") return `${field.label} must be text.`;
        if (value.length > field.maxLength) return `${field.label} can be at most ${field.maxLength} characters.`;
        break;
    }
  }
  return gen.validate?.(opts) ?? null;
}
