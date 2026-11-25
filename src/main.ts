import "./styles/main.css";
import "./styles/studio.css";
import { canCheck, checksFor, type CheckResult } from "./core/availability.ts";
import { generateBatch } from "./core/batch.ts";
import { personaColumns, toCsv } from "./core/csv.ts";
import { createHistoryBuffer } from "./core/history-buffer.ts";
import { trainRanker } from "./core/rank.ts";
import { decodeShortlist, type SharedItem } from "./core/share.ts";
import { createSkips } from "./core/skips.ts";
import { browserStore, createLibrary } from "./core/library.ts";
import { type Preset, PRESETS } from "./core/presets.ts";
import { findGenerator, GENERATORS } from "./core/registry.ts";
import { secureRng } from "./core/rng.ts";
import { type Arm, createBatchStars, createStats, type ModelKind } from "./core/stats.ts";
import { MIN_FAVOURITES, POOL_FACTOR, rankByTaste, similarFavourites, trainTaste, type RankedResult } from "./core/taste.ts";
import { GenerationError, type Generator, type Options } from "./core/types.ts";
import { validateOptions } from "./core/validate.ts";
import { createProfiles, createSwitchableStore, memoryStore, type Session } from "./core/vault.ts";
import { setupAuthDialog } from "./ui/auth.ts";
import { byId, copyText, h } from "./ui/dom.ts";
import { linkNumberBox, renderFields } from "./ui/form.ts";
import { icon } from "./ui/icons.ts";
import { setupLibraryDrawer } from "./ui/library-panel.ts";
import { forge, reducedMotion } from "./ui/ambient.ts";
import { setupQuickForge } from "./ui/quick.ts";
import { setupRate } from "./ui/rate.ts";
import { setupPreview, hasPreview } from "./ui/preview.ts";
import { startShowcase } from "./ui/showcase.ts";
import { canSpeak, speak } from "./ui/speak.ts";
import { setupThemeToggle } from "./ui/theme.ts";
import { setupWelcome } from "./ui/welcome.ts";
import { toast } from "./ui/toast.ts";

document.getElementById("notRunning")?.remove();

/** Device-wide settings (theme, taste toggle) and the encrypted profiles. */
const device = browserStore();
const profiles = createProfiles(device);
/**
 * Saved items: a signed-in profile's decrypted items, or — for guests — an
 * in-memory store that's forgotten when the tab closes. Nothing saved is
 * visible until someone signs in.
 */
const savedStore = createSwitchableStore(memoryStore());
let session: Session | null = null;
const library = createLibrary(savedStore, new Set(GENERATORS.filter(g => g.sensitive).map(g => g.id)));
const stats = createStats(savedStore);
const batchStars = createBatchStars(stats);
const drawer = setupLibraryDrawer(library, stats, () => {
  drawer.render();
  refreshStars();
  updateTasteStatus();
}, (generatorId, value, nowFavourite) => {
  // A star on a visible result counts the same whether it's clicked there or in the drawer.
  if (generatorId === current.id) batchStars.toggled(value, nowFavourite);
});
const skips = createSkips(savedStore);
/** Skips needed before the ranker that also learns from them takes over from the stars-only model. */
const MIN_SKIPS = 10;
/** The last batch that stayed on screen long enough to be seen; its unstarred names become skips. */
let lastSeen: { generatorId: string; values: string[] } | null = null;
const historyBuffer = createHistoryBuffer((generatorId, values) => {
  library.addToHistory(generatorId, values); // ignored for sensitive generators
  lastSeen = { generatorId, values };
  batchStars.seen(); // the batch stayed on screen: now it counts in Insights
  drawer.render();
});

/** Records the seen batch's unstarred names as skips, once it's replaced. */
function recordSkips(): void {
  if (!lastSeen) return;
  const gen = findGenerator(lastSeen.generatorId);
  if (gen && !gen.sensitive) {
    skips.add(gen.id, lastSeen.values.filter(v => !library.isFavourite(gen.id, v)));
  }
  lastSeen = null;
}
// Don't lose the batch on screen if the tab closes before it settles.
window.addEventListener("pagehide", () => historyBuffer.commit());
// Saving is encrypted (async), so also commit when the tab is hidden, which leaves time to finish.
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") historyBuffer.commit();
});

const nav = byId<HTMLUListElement>("genNav");
const fieldsEl = byId("fields");
const formError = byId("formError");
const results = byId<HTMLUListElement>("results");
const batchNote = byId("batchNote");
const announcer = byId("announcer");
const countInput = byId<HTMLInputElement>("count");
const tasteToggle = byId<HTMLInputElement>("tasteToggle");
const tasteStatus = byId("tasteStatus");

let current: Generator = GENERATORS[0];
let readOptions: () => Options = () => current.defaults;
/** The values on screen, for "Copy all". */
let shown: string[] = [];
/** Whether the visible batch was ranked by taste (and is part of the taste-vs-random experiment). */
let learningBatch = false;
/** Options the user set this session, so switching generators doesn't lose them. Not persisted. */
const sessionOptions = new Map<string, Options>();

// ---- Taste learning on/off (remembered in this browser) ----

const TASTE_KEY = "toolkit:taste";
tasteToggle.checked = device.getItem(TASTE_KEY) !== "off";
tasteToggle.addEventListener("change", () => {
  try {
    device.setItem(TASTE_KEY, tasteToggle.checked ? "on" : "off");
  } catch {
    // not remembered; still applies now
  }
  generate();
});

const favouritesFor = (gen: Generator) => library.favourites().filter(f => f.generatorId === gen.id).map(f => f.value);

function updateTasteStatus(): void {
  byId("tasteControl").hidden = current.sensitive;
  if (current.sensitive) {
    tasteStatus.textContent = "";
    return;
  }
  const n = favouritesFor(current).length;
  tasteStatus.dataset.state = "";
  if (!tasteToggle.checked) tasteStatus.textContent = "Taste learning is off. Results are fully random.";
  else if (n < MIN_FAVOURITES) {
    // First-run hint: the feature is invisible until you star something, so explain it up front.
    const more = MIN_FAVOURITES - n;
    tasteStatus.dataset.state = "hint";
    tasteStatus.replaceChildren(
      icon("sparkle"),
      h("span", {},
        h("strong", {}, n === 0 ? "KeyForge learns your style. " : `${n} of ${MIN_FAVOURITES} stars. `),
        `Star ${more} ${n === 0 ? "" : "more "}name${more === 1 ? "" : "s"} you like with ☆, and new results will be ranked to match your taste.`,
      ),
    );
  } else {
    const skipped = skips.list(current.id).length;
    tasteStatus.textContent = skipped >= MIN_SKIPS
      ? `Learning from your ${n} stars and ${skipped} names you skipped, with a few random picks mixed in so you still see new styles.`
      : `Ranked by similarity to your ${n} favourites, with a few random picks mixed in so you still see new styles.`;
  }
}

// ---- Generator picker ----

nav.replaceChildren(...GENERATORS.map(g =>
  h("li", {}, h("a", { href: `#${g.id}`, class: "gen-link", "data-id": g.id },
    icon(g.icon),
    h("span", {}, g.name),
  )),
));

function selectGenerator(id: string): void {
  current = findGenerator(id) ?? GENERATORS[0];
  byId("genIcon").replaceChildren(icon(current.icon));
  byId("genTitle").textContent = current.name;
  byId("genDesc").textContent = current.description;
  document.title = `${current.name} generator · KeyForge`;
  nav.querySelectorAll<HTMLAnchorElement>(".gen-link").forEach(a => {
    if (a.dataset.id === current.id) {
      a.setAttribute("aria-current", "page");
      a.scrollIntoView({ block: "nearest", inline: "nearest" }); // the menu scrolls sideways on phones
    } else a.removeAttribute("aria-current");
  });

  readOptions = renderFields(fieldsEl, current, sessionOptions.get(current.id) ?? current.defaults, countField);
  const madeFor = byId("madeFor");
  const uses = PRESETS.filter(p => p.generatorId === current.id && Object.keys(p.options).length > 0);
  madeFor.hidden = uses.length === 0;
  madeFor.replaceChildren(h("span", { class: "made-for-label" }, "Set up for"), ...uses.map(preset => {
    const chip = h("button", { type: "button", class: "chip small" }, preset.title);
    chip.addEventListener("click", () => {
      openPreset(preset);
      toast(`Set up for ${preset.title.toLowerCase()}`);
    });
    return chip;
  }));
  createTab.href = `#${current.id}`; // "Create" on the phone tab bar returns to the last generator
  byId("secretNote").hidden = !current.sensitive;
  // Secrets are never written to files: no CSV for passwords.
  byId("csvBtn").hidden = current.sensitive;
  generate();
}

// ---- Screens: Home (guided start) and Create (a generator) ----

type View = "home" | "how" | "tools" | "rate" | "create";
const VIEW_TITLES: Record<Exclude<View, "create">, string> = {
  home: "KeyForge · Find a name that's unmistakably you",
  how: "How it works · KeyForge",
  tools: "What are you naming? · KeyForge",
  rate: "Rate a name · KeyForge",
};
const countField = byId("countField");
const createTab = document.querySelector<HTMLAnchorElement>('[data-tab-item="create"]')!;

function showView(view: View): void {
  const changed = document.body.dataset.view !== view;
  document.body.dataset.view = view;
  for (const tab of document.querySelectorAll<HTMLElement>("[data-tab-item]")) {
    if (tab.dataset.tabItem === (view === "create" ? "create" : "home")) tab.setAttribute("aria-current", "page");
    else tab.removeAttribute("aria-current");
  }
  byId("homeLink").toggleAttribute("aria-current", view === "home");
  byId("howLink").toggleAttribute("aria-current", view === "how");
  byId("toolsLink").toggleAttribute("aria-current", view === "tools");
  byId("rateLink").toggleAttribute("aria-current", view === "rate");
  // Off the Create screen no generator is "current".
  for (const link of nav.querySelectorAll<HTMLAnchorElement>(".gen-link[data-id]")) {
    if (view !== "create") link.removeAttribute("aria-current");
    else if (link.dataset.id === current.id) link.setAttribute("aria-current", "page");
  }
  if (view !== "create") document.title = VIEW_TITLES[view];
  if (changed) window.scrollTo({ top: 0 });
}

/** Generator ids open Create; "#home" (or nothing), "#how" and "#tools" open those screens; other hashes (the "#main" skip link) are page anchors. */
function route(): void {
  const id = location.hash.slice(1);
  if (findGenerator(id)) {
    selectGenerator(id);
    showView("create");
  } else if (id === "" || id === "home") {
    showView("home");
  } else if (id === "how" || id === "tools" || id === "rate") {
    showView(id);
  } else {
    openSharedShortlist();
  }
}
window.addEventListener("hashchange", route);

// The guided start: one card per job, each setting up the right generator and options.
byId("presetGrid").replaceChildren(...PRESETS.map(preset => {
  const card = h("button", { type: "button", class: "preset-card", "data-preset": preset.id, style: `--tone:${preset.tone}` },
    h("span", { class: "preset-icon" }, icon(preset.icon)),
    h("span", { class: "preset-cat" }, `${findGenerator(preset.generatorId)?.name ?? ""} tool`),
    h("span", { class: "preset-title" }, preset.title),
    h("span", { class: "preset-hint" }, preset.hint),
    h("span", { class: "preset-example" }, preset.example),
    h("span", { class: "preset-go", "aria-hidden": "true" }, icon("arrow-right")),
  );
  card.addEventListener("click", () => openPreset(preset));
  return h("li", {}, card);
}));

/** Opens a preset's generator with the preset's options applied. */
function openPreset(preset: Preset): void {
  const gen = findGenerator(preset.generatorId);
  if (!gen) return;
  sessionOptions.set(gen.id, { ...gen.defaults, ...preset.options });
  if (location.hash === `#${gen.id}`) route(); // already there: just apply the new options
  location.hash = gen.id;
}

// All tools: every few seconds one card shows a freshly made sample, so the
// examples are real output, not a fixed list. (Passwords keep their placeholder.)
if (!reducedMotion()) {
  setInterval(() => {
    if (document.body.dataset.view !== "tools" || document.hidden) return;
    const preset = PRESETS[secureRng.int(PRESETS.length)];
    const sample = forge(preset);
    const el = document.querySelector<HTMLElement>(`[data-preset="${preset.id}"] .preset-example`);
    if (!sample || !el) return;
    el.textContent = sample;
    el.classList.remove("fresh");
    void el.offsetWidth; // restart the fade-in
    el.classList.add("fresh");
  }, 2200);
}

// Rate a name: works with the same previews and voice as the results.
const rate = setupRate({
  preview: name => {
    const username = findGenerator("username");
    if (username) preview.open(username, name);
  },
  speak: canSpeak() ? speak : null,
});

// Home's Try-it card: real names to copy straight away.
setupQuickForge(PRESETS, openPreset);
startShowcase(() => document.body.dataset.view === "how");

// Phone tab bar: Saved and Profile reuse the sidebar's buttons.
byId("tabSaved").addEventListener("click", () => byId("libraryBtn").click());
byId("tabAccount").addEventListener("click", () => byId("accountBtn").click());

// Install as an app (supported browsers offer this; others hide the button).
let installPrompt: (Event & { prompt(): Promise<void> }) | null = null;
window.addEventListener("beforeinstallprompt", event => {
  event.preventDefault();
  installPrompt = event as Event & { prompt(): Promise<void> };
  byId("installBtn").hidden = false;
});
byId("installBtn").addEventListener("click", async () => {
  await installPrompt?.prompt();
  installPrompt = null;
  byId("installBtn").hidden = true;
});
window.addEventListener("appinstalled", () => toast("KeyForge is installed. Open it from your home screen or app list."));

// ---- Shared shortlists (#share=… links) ----

const shareDialog = byId<HTMLDialogElement>("shareDialog");
let shared: SharedItem[] = [];

/** Shows the names in a shared link, if the page was opened with one. Returns whether it did. */
function openSharedShortlist(): boolean {
  const items = decodeShortlist(location.hash, id => !(findGenerator(id)?.sensitive ?? true));
  if (!items) return false;
  // Drop the names from the address bar, so a reload or bookmark doesn't reopen them.
  history.replaceState(null, "", `${location.pathname}#${current.id}`);
  if (items.length === 0) {
    toast("That shared link has no names in it", "error");
    return true;
  }
  shared = items;
  byId("shareList").replaceChildren(...items.map(item => {
    const button = h("button", { type: "button", class: "lib-copy" },
      h("span", { class: "lib-value" }, item.value),
      h("span", { class: "lib-meta" }, findGenerator(item.generatorId)?.name ?? item.generatorId));
    button.addEventListener("click", async () => {
      toast((await copyText(item.value)) ? `Copied “${item.value}”` : "Couldn't copy", "info");
    });
    return h("li", { class: "lib-item" }, button);
  }));
  if (!shareDialog.open) shareDialog.showModal();
  return true;
}

byId("shareClose").append(icon("x"));
byId("shareClose").addEventListener("click", () => shareDialog.close());
byId("shareSave").addEventListener("click", () => {
  let added = 0;
  for (const item of shared) {
    if (!library.isFavourite(item.generatorId, item.value) && library.toggleFavourite(item.generatorId, item.value)) added++;
  }
  shareDialog.close();
  toast(session ? `Saved ${added} name${added === 1 ? "" : "s"} to your favourites` : `Saved ${added} for this visit. Sign in to keep them.`);
  drawer.render();
  refreshStars();
  updateTasteStatus();
});

// ---- Generating ----

/** Plain random results, or a bigger pool ranked by the user's taste. */
function pickResults(opts: Options, count: number): { picked: RankedResult[]; shortBy: number; learning: boolean; model: ModelKind } {
  const favourites = favouritesFor(current);
  const canLearn = !current.sensitive && favourites.length >= MIN_FAVOURITES;
  const learning = canLearn && tasteToggle.checked;

  if (!learning) {
    const { values, shortBy } = generateBatch(current, opts, count, secureRng);
    return { picked: values.map(value => ({ value, match: 0, source: "explore" })), shortBy, learning: false, model: "trigram" };
  }
  // Leave out names already starred, so learning surfaces new ones.
  const known = new Set(favourites);
  const pool = generateBatch(current, opts, count * POOL_FACTOR, secureRng).values.filter(v => !known.has(v));
  // With enough skips, learn from both "yes" (stars) and "no" (skips); otherwise from stars alone.
  const skipped = skips.list(current.id).filter(v => !known.has(v));
  const useRanker = skipped.length >= MIN_SKIPS;
  const model = useRanker ? trainRanker(favourites, skipped) : trainTaste(favourites);
  const picked = rankByTaste(pool, model, count, secureRng);
  return { picked, shortBy: count - picked.length, learning: true, model: useRanker ? "ranker" : "trigram" };
}

function generate(): void {
  recordSkips(); // the batch being replaced: seen but not starred
  const opts = readOptions();
  sessionOptions.set(current.id, opts);
  const count = Number(countInput.value);
  updateTasteStatus();

  const error = validateOptions(current, opts);
  formError.textContent = error ?? "";
  if (error) {
    clearResults();
    return;
  }

  try {
    const { picked, shortBy, learning, model } = pickResults(opts, count);
    learningBatch = learning;
    // Only taste batches are measured: each result is credited to the group that picked it.
    // The batch is recorded once it's been seen (see historyBuffer), not now.
    const arms = new Map<string, Arm>(learning ? picked.map(p => [p.value, p.source === "taste" ? "taste" : "random"]) : []);
    batchStars.newBatch(arms, model);
    batchNote.textContent = shortBy > 0 ? `Only ${picked.length} different results are possible with these options.` : "";
    showResults(picked, opts);
    byId("resultCount").textContent = String(picked.length);
    announcer.textContent = `${picked.length} new ${current.name.toLowerCase()} results`;
    historyBuffer.offer(current.id, picked.map(p => p.value));
  } catch (e) {
    if (!(e instanceof GenerationError)) throw e;
    formError.textContent = e.message;
    clearResults();
  }
}

/**
 * Removes the previous results when there's nothing valid to show, so old rows
 * (perhaps from another generator) can't be copied, starred or checked.
 */
function clearResults(): void {
  batchStars.newBatch();
  learningBatch = false;
  shown = [];
  results.replaceChildren(h("li", { class: "empty" }, "Fix the option above to see results."));
  byId("resultCount").textContent = "0";
  batchNote.textContent = "";
}

/** Brief inline "copied" state on a row: a check mark instead of the copy icon. */
function flashCopied(item: HTMLElement): void {
  item.classList.add("copied");
  item.querySelector(".copy-indicator")?.replaceChildren(icon("check"));
  setTimeout(() => {
    item.classList.remove("copied");
    item.querySelector(".copy-indicator")?.replaceChildren(icon("copy"));
  }, 1200);
}

/** A result's text. Personas ("Name · @handle · email") get one line per part; the text itself is unchanged. */
function valueEl(genId: string, value: string): HTMLElement {
  const parts = value.split(" · ");
  if (genId !== "persona" || parts.length !== 3) return h("span", { class: "value" }, value);
  const sep = () => h("span", { class: "visually-hidden" }, " · ");
  return h("span", { class: "value persona-value" },
    h("span", { class: "pv-name" }, parts[0]), sep(),
    h("span", { class: "pv-handle" }, parts[1]), sep(),
    h("span", { class: "pv-email" }, parts[2]));
}

function showResults(picked: RankedResult[], opts: Options): void {
  shown = picked.map(p => p.value);
  // Rows remember the generator that made them, so handlers never act on a different one.
  const gen = current;
  results.dataset.gen = gen.id;
  const favourites = learningBatch ? favouritesFor(gen) : [];

  results.replaceChildren(...picked.map(({ value }, i) => {
    const note = gen.describe?.(value, opts);
    const noteEl = note
      ? h("span", { class: "note" },
        note.meter !== undefined
          ? h("span", { class: "meter", "data-tone": String(note.tone ?? 2), "aria-hidden": "true" },
            h("span", { style: `width:${Math.round(note.meter * 100)}%` }))
          : "",
        note.text)
      : "";

    // "Why this?" — shown the same way on every result, so you can't tell taste
    // picks from random ones. That keeps the taste-vs-random comparison blind.
    const similar = learningBatch ? similarFavourites(value, favourites) : [];
    // Shown only AFTER you star a name: taste picks resemble your favourites more often, so
    // showing it beforehand would hint which group a name came from and spoil the blind test.
    const why = similar.length > 0
      ? h("span", { class: "why", hidden: "" }, icon("sparkle"), `Similar to ${similar.join(", ")}`)
      : null;

    const meta = h("span", { class: "result-meta" },
      // Length matters for handles and repo names (platform limits), not for multi-word values.
      gen.sensitive || value.includes(" ") ? "" : h("span", { title: "Characters" }, `${value.length}`),
      h("span", { class: "copy-indicator" }, icon("copy")),
    );

    // The button's name comes from its visible text (plus a hidden "Copy"), so what
    // voice-control users see matches what they can say.
    const main = h("button", { type: "button", class: "result-main", title: "Click to copy" },
      h("span", { class: "visually-hidden" }, "Copy "), valueEl(gen.id, value), meta, why ?? "", noteEl);
    main.addEventListener("click", async () => {
      const ok = await copyText(value);
      if (!ok) {
        toast("Couldn't copy. Try selecting the text instead.", "error");
        return;
      }
      historyBuffer.commit();
      flashCopied(item);
      announcer.textContent = gen.sensitive ? "Password copied" : `Copied ${value}`;
    });

    const actions = h("span", { class: "row-actions" });
    const item = h("li", { class: "result", style: `--i:${i}` },
      h("span", { class: "result-index", "aria-hidden": "true" }, String(i + 1).padStart(2, "0")),
      main,
      actions,
    );
    if (canSpeak() && !gen.sensitive) {
      const say = h("button", { type: "button", class: "icon-btn", title: "Say it aloud", "aria-label": `Say ${value} aloud` }, icon("volume"));
      say.addEventListener("click", () => speak(value));
      actions.append(say);
    }
    if (hasPreview(gen.id)) {
      const look = h("button", { type: "button", class: "icon-btn preview-btn", title: "Preview: see it as a profile, app icon, website or logo", "aria-label": `Preview ${value}` }, icon("image"));
      look.addEventListener("click", () => preview.open(gen, value));
      actions.append(look);
    }
    if (gen.id === "username") {
      const rateBtn = h("button", {
        type: "button", class: "icon-btn", title: "Rate it, and see variations if it's taken", "aria-label": `Rate ${value} and see variations`,
      }, icon("chart"));
      rateBtn.addEventListener("click", () => {
        rate.show(value);
        location.hash = "rate";
      });
      actions.append(rateBtn);
    }
    if (canCheck(gen.id)) {
      const check = h("button", {
        type: "button", class: "icon-btn", title: "Check if this name is free", "aria-label": `Check if ${value} is free`,
      }, icon("globe"));
      check.addEventListener("click", () => void runChecks(item, gen.id, value));
      actions.append(check);
    }
    if (!gen.sensitive) {
      const star = h("button", { type: "button", class: "icon-btn star", "data-value": value });
      star.addEventListener("click", () => {
        const saved = library.toggleFavourite(gen.id, value);
        historyBuffer.commit(); // starring means it was seen: record the batch first...
        batchStars.toggled(value, saved); // ...then credit the star to its group
        if (why) why.hidden = !saved;
        const n = favouritesFor(gen).length;
        if (saved && tasteToggle.checked && n === MIN_FAVOURITES) toast("Taste learning is now on for new results");
        else if (saved && !session && !guestWarned) {
          guestWarned = true;
          toast("Saved for this visit only. Sign in to keep favourites.");
        }
        refreshStars();
        drawer.render();
        updateTasteStatus();
      });
      actions.append(star);
    }
    return item;
  }));
  refreshStars();
}

// ---- Optional availability check (sends the name to GitHub / npm / Google DNS) ----

const CHECKS_KEY = "toolkit:checks-ok";
const LABELS: Record<CheckResult["status"], string> = { free: "free", taken: "taken", invalid: "not allowed", unknown: "couldn't check" };

async function runChecks(item: HTMLElement, generatorId: string, value: string): Promise<void> {
  if (device.getItem(CHECKS_KEY) !== "yes") {
    const ok = confirm(
      "Checking sends this name to GitHub, and for project names also to npm and Google's DNS service, " +
      "to see if it's taken. Nothing else is sent. Allow checks on this device?",
    );
    if (!ok) return;
    try {
      device.setItem(CHECKS_KEY, "yes");
    } catch {
      // not remembered; it will ask again next time
    }
  }
  const checks = checksFor(generatorId, value);
  if (!checks) return;
  const box = item.querySelector(".checks") ?? h("span", { class: "checks", "aria-live": "polite" });
  box.replaceChildren(h("span", { class: "muted" }, "Checking…"));
  item.append(box);
  const outcomes = await Promise.all(checks);
  box.replaceChildren(...outcomes.map(r =>
    h("a", { class: `check-chip ${r.status}`, href: r.url, target: "_blank", rel: "noopener noreferrer" },
      `${r.service}: ${LABELS[r.status]}${r.service.endsWith(".com") && r.status === "free" ? " (probably)" : ""}`),
  ));
}

/** Syncs result stars with the library (it can also change from the drawer). */
function refreshStars(): void {
  results.querySelectorAll<HTMLButtonElement>(".star").forEach(star => {
    const value = star.dataset.value ?? "";
    const on = library.isFavourite(current.id, value);
    star.replaceChildren(icon("star", on));
    star.setAttribute("aria-pressed", String(on));
    star.setAttribute("aria-label", on ? `Remove ${value} from favourites` : `Save ${value} to favourites`);
    star.title = on ? "Remove from favourites" : "Save to favourites";
  });
}

// ---- Profiles: sign in / sign out ----

let guestWarned = false;
const accountButton = byId<HTMLButtonElement>("accountBtn");

function renderAccount(): void {
  const label = accountButton.querySelector(".nav-label")!;
  accountButton.querySelector(".nav-hint")?.remove();
  if (session) {
    label.textContent = session.profile.name;
    accountButton.append(h("span", { class: "nav-hint" }, "Sign out"));
    accountButton.title = `Signed in as ${session.profile.name}. Click to sign out and lock your saved names.`;
  } else {
    label.textContent = "Sign in";
    accountButton.title = "Sign in to see and keep your saved names";
  }
  byId("guestNote").hidden = session !== null;
  byId("backupBtn").hidden = session === null;
  byId("libNote").textContent = session
    ? `Encrypted in this browser for “${session.profile.name}”. No server. Passwords are never saved.`
    : "Stored only in this browser. No server. Passwords are never saved.";
}

/** Re-draws everything that shows saved items, after the store behind them changed. */
function savedItemsChanged(): void {
  renderAccount();
  drawer.render();
  refreshStars();
  updateTasteStatus();
  generate(); // taste learning now uses this profile's favourites
}

const auth = setupAuthDialog(profiles, (signedIn, moved) => {
  historyBuffer.commit();
  // Keep anything starred while signed out: merge the guest's items into the profile.
  const guestItems = library.exportJson();
  session = signedIn;
  savedStore.use(signedIn.store);
  library.importJson(guestItems);
  savedItemsChanged();
  toast(`Signed in as ${signedIn.profile.name}${moved > 0 ? ` · ${moved} earlier saved item${moved === 1 ? "" : "s"} moved in` : ""}`);
});

accountButton.prepend(icon("user"));
async function signOut(reason = ""): Promise<void> {
  if (!session) return;
  historyBuffer.commit();
  const name = session.profile.name;
  await session.saved(); // finish encrypting the latest changes before letting go of the key
  session = null;
  savedStore.use(memoryStore());
  guestWarned = false;
  savedItemsChanged();
  toast(`${reason}${name}'s saved names are locked.`);
}

accountButton.addEventListener("click", () => {
  if (session) void signOut("Signed out. ");
  else auth.show();
});

// Auto-lock: someone walking up to an unattended screen shouldn't see your saved names.
const AUTO_LOCK_MS = 15 * 60 * 1000;
let lastActivity = Date.now();
for (const type of ["pointerdown", "keydown", "scroll"] as const) {
  window.addEventListener(type, () => (lastActivity = Date.now()), { passive: true });
}
setInterval(() => {
  if (session && Date.now() - lastActivity > AUTO_LOCK_MS) void signOut("Locked after 15 minutes without activity. ");
}, 30_000);

byId("backupBtn").addEventListener("click", async () => {
  if (!session) return;
  const file = await profiles.backup(session);
  const link = h("a", {
    href: URL.createObjectURL(new Blob([file], { type: "application/json" })),
    download: `keyforge-backup-${session.profile.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.json`,
  });
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  toast("Encrypted backup downloaded. Only your password can open it.");
});
byId("guestSignIn").addEventListener("click", () => auth.show());

// ---- Interactions ----

byId("genForm").addEventListener("submit", event => {
  event.preventDefault();
  generate();
});
byId("regenBtn").prepend(icon("refresh"));
byId("regenBtn").addEventListener("click", generate);

byId("copyAllBtn").prepend(icon("copy"));
byId("copyAllBtn").addEventListener("click", async () => {
  if (shown.length === 0) return;
  const ok = await copyText(shown.join("\n"));
  if (ok) historyBuffer.commit();
  toast(ok ? `Copied ${shown.length} result${shown.length === 1 ? "" : "s"}, one per line` : "Couldn't copy", ok ? "info" : "error");
});

byId("csvBtn").prepend(icon("download"));
byId("csvBtn").addEventListener("click", () => {
  const opts = readOptions();
  if (validateOptions(current, opts)) return;
  try {
    const { values } = generateBatch(current, opts, 100, secureRng);
    const csv = current.id === "persona"
      ? toCsv(["name", "username", "email"], values.map(personaColumns))
      : toCsv([current.name.toLowerCase()], values.map(v => [v]));
    const link = h("a", {
      href: URL.createObjectURL(new Blob([csv], { type: "text/csv" })),
      download: `keyforge-${current.id}-${values.length}.csv`,
    });
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
    toast(`Downloaded ${values.length} ${current.name.toLowerCase()}s as CSV`);
  } catch (e) {
    if (!(e instanceof GenerationError)) throw e;
    toast(e.message, "error");
  }
});

byId("resetBtn").addEventListener("click", () => {
  sessionOptions.delete(current.id);
  readOptions = renderFields(fieldsEl, current, current.defaults);
  generate();
});

/** Live results: regenerate shortly after options change (a little longer while typing). */
let debounce: number | undefined;
byId("genForm").addEventListener("input", event => {
  const target = event.target as HTMLElement;
  const isTyping = target instanceof HTMLInputElement && (target.type === "text" || target.type === "number");
  clearTimeout(debounce);
  debounce = window.setTimeout(generate, isTyping ? 250 : 60);
});

byId("countHead").append(linkNumberBox(countInput, "How many"));

// "R" regenerates — unless the user is typing somewhere.
document.addEventListener("keydown", event => {
  if (event.key.toLowerCase() !== "r" || event.ctrlKey || event.metaKey || event.altKey) return;
  if (drawer.isOpen() || document.querySelector("dialog[open]") || document.body.classList.contains("welcome-open")) return;
  const target = event.target as HTMLElement;
  if (target.matches("input[type=text], input[type=password], input[type=number], textarea, select, [contenteditable]")) return;
  event.preventDefault();
  generate();
});

// ---- Installable app (PWA): only in the built site, served over http(s) ----

if (import.meta.env.PROD && "serviceWorker" in navigator && location.protocol.startsWith("http")) {
  navigator.serviceWorker.register("./sw.js").catch(() => {
    // Offline support is a bonus; the app works without it.
  });
}

// ---- Start ----

byId("libraryBtn").prepend(icon("bookmark"));
byId("drawerClose").append(icon("x"));
setupThemeToggle(byId<HTMLButtonElement>("themeBtn"));
renderAccount();
const preview = setupPreview();
// Tab bar and Start link icons.
for (const [selector, name] of [['[data-tab-item="home"]', "home"], ['[data-tab-item="create"]', "plus"], ["#tabSaved", "bookmark"], ["#tabAccount", "user"], ["#homeLink", "home"], ["#howLink", "sparkle"], ["#toolsLink", "layers"], ["#rateLink", "chart"], ["#installBtn", "install"]] as const) {
  document.querySelector(selector)?.prepend(icon(name));
}
// Prepare the Create screen (using the generator in the link, or the first one), then show the right screen.
selectGenerator(findGenerator(location.hash.slice(1))?.id ?? GENERATORS[0].id);
route();
drawer.render();
// A shared link opens its shortlist first. Otherwise, opening the app shows the
// sign-in screen when there's something to unlock (or old items to move in) —
// after the welcome screen on a first visit.
const askToSignIn = () => {
  if (profiles.list().length > 0) auth.show("signin");
  else if (profiles.legacyItemCount() > 0) auth.show("create");
};
let welcomeShowing = false;
const welcome = setupWelcome(device, () => {
  if (welcomeShowing) {
    welcomeShowing = false;
    askToSignIn();
  }
  byId("main").focus();
});
if (!openSharedShortlist()) {
  welcomeShowing = welcome.showIfFirstVisit();
  if (!welcomeShowing) askToSignIn();
}
