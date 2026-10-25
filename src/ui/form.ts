import type { Generator, OptionField, Options, OptionValue } from "../core/types.ts";
import { h } from "./dom.ts";

/** Selects with this many choices or fewer become pill buttons; more become a dropdown. */
const MAX_PILLS = 4;

/**
 * Builds a generator's options form from its `fields` declaration — this is
 * why adding a generator needs no UI code. Returns a function that reads the
 * current values back.
 *   number  → slider with a live value
 *   boolean → toggle switch
 *   select  → pill buttons (few choices) or a dropdown (many)
 *   text    → text box
 */
export function renderFields(container: HTMLElement, gen: Generator, values: Options): () => Options {
  const render = (field: OptionField) => renderField(gen.id, field, values[field.key]);
  const inputs = gen.fields.filter(f => f.kind !== "boolean").map(render);
  const toggles = gen.fields.filter(f => f.kind === "boolean").map(render);
  container.replaceChildren(
    ...inputs,
    toggles.length > 0 ? h("div", { class: "toggles" }, ...toggles) : "",
  );
  return () => readFields(container, gen);
}

function helpText(id: string, help?: string) {
  return help ? h("small", { id, class: "help" }, help) : "";
}

function renderField(genId: string, field: OptionField, value: OptionValue | undefined): HTMLElement {
  const id = `opt-${genId}-${field.key}`;
  const helpId = field.help ? `${id}-help` : undefined;

  switch (field.kind) {
    case "boolean": {
      const input = h("input", { type: "checkbox", role: "switch", id, name: field.key, "aria-describedby": helpId });
      input.checked = value === true;
      return h("label", { class: "toggle", for: id },
        input,
        h("span", { class: "toggle-track", "aria-hidden": "true" }, h("span", { class: "toggle-thumb" })),
        h("span", { class: "toggle-label" }, field.label),
      );
    }

    case "number": {
      const input = h("input", {
        type: "range", id, name: field.key, min: String(field.min), max: String(field.max), step: "1",
        "aria-describedby": helpId,
      });
      input.value = String(value ?? field.min);
      return h("div", { class: "field" },
        h("div", { class: "field-head" }, h("label", { for: id }, field.label), linkNumberBox(input, field.label)),
        input, helpText(helpId ?? "", field.help),
      );
    }

    case "select": {
      if (field.choices.length <= MAX_PILLS) {
        const pills = field.choices.map(choice => {
          const radio = h("input", { type: "radio", name: field.key, value: choice.value });
          radio.checked = choice.value === value;
          return h("label", { class: "pill" }, radio, h("span", {}, choice.label));
        });
        return h("fieldset", { class: "field pills-field", "aria-describedby": helpId },
          h("legend", {}, field.label),
          h("div", { class: "pills" }, ...pills),
          helpText(helpId ?? "", field.help),
        );
      }
      const select = h("select", { id, name: field.key, "aria-describedby": helpId },
        ...field.choices.map(c => h("option", { value: c.value }, c.label)));
      select.value = String(value ?? "");
      return h("div", { class: "field" }, h("label", { for: id }, field.label), select, helpText(helpId ?? "", field.help));
    }

    case "text": {
      const input = h("input", {
        type: "text", id, name: field.key, maxlength: String(field.maxLength), placeholder: field.placeholder,
        autocomplete: "off", spellcheck: "false", "aria-describedby": helpId,
      });
      input.value = String(value ?? "");
      return h("div", { class: "field" }, h("label", { for: id }, field.label), input, helpText(helpId ?? "", field.help));
    }
  }
}

/**
 * A small number box next to a slider, kept in sync both ways, so exact
 * values (e.g. a 32-character password) can be typed instead of dragged.
 * Out-of-range values are fixed when the box loses focus.
 */
export function linkNumberBox(range: HTMLInputElement, label: string): HTMLInputElement {
  const min = Number(range.min), max = Number(range.max);
  const box = h("input", {
    type: "number", class: "range-value", min: range.min, max: range.max, step: "1",
    inputmode: "numeric", "aria-label": `${label} (type a number)`,
  });
  box.value = range.value;

  const paint = () => range.style.setProperty("--fill", `${((Number(range.value) - min) / (max - min)) * 100}%`);
  range.addEventListener("input", () => {
    box.value = range.value;
    paint();
  });
  box.addEventListener("input", event => {
    const n = Number(box.value);
    // While typing "12", "1" is briefly out of range: leave the slider alone until it's valid.
    if (box.value === "" || !Number.isInteger(n) || n < min || n > max) {
      event.stopPropagation(); // don't regenerate with a half-typed value
      return;
    }
    range.value = String(n);
    paint();
  });
  box.addEventListener("change", () => {
    const n = Math.round(Number(box.value));
    const fixed = Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : Number(range.value);
    box.value = String(fixed);
    if (String(fixed) !== range.value) {
      range.value = String(fixed);
      range.dispatchEvent(new Event("input", { bubbles: true }));
    }
  });
  paint();
  return box;
}

function readFields(container: HTMLElement, gen: Generator): Options {
  const opts: Options = {};
  for (const field of gen.fields) {
    if (field.kind === "select") {
      const el = container.querySelector<HTMLInputElement | HTMLSelectElement>(
        `input[name="${field.key}"]:checked, select[name="${field.key}"]`,
      );
      opts[field.key] = el?.value ?? "";
      continue;
    }
    const input = container.querySelector<HTMLInputElement>(`input[name="${field.key}"]`);
    if (!input) continue;
    if (field.kind === "boolean") opts[field.key] = input.checked;
    else if (field.kind === "number") opts[field.key] = Number(input.value);
    else opts[field.key] = input.value;
  }
  return opts;
}
