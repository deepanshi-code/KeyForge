import "./styles/main.css";
import { generateBatch } from "./core/batch.ts";
import { createHistoryBuffer } from "./core/history-buffer.ts";
import { browserStore, createLibrary } from "./core/library.ts";
import { findGenerator, GENERATORS } from "./core/registry.ts";
import { secureRng } from "./core/rng.ts";
import { createBatchStars, createStats, type Mode } from "./core/stats.ts";
import { MIN_FAVOURITES, POOL_FACTOR, rankByTaste, trainTaste, type RankedResult } from "./core/taste.ts";
import { GenerationError, type Generator, type Options } from "./core/types.ts";
import { validateOptions } from "./core/validate.ts";
import { createProfiles, createSwitchableStore, memoryStore, type Session } from "./core/vault.ts";
import { setupAuthDialog } from "./ui/auth.ts";
import { byId, copyText, h } from "./ui/dom.ts";
import { linkNumberBox, renderFields } from "./ui/form.ts";
import { icon } from "./ui/icons.ts";
import { setupLibraryDrawer } from "./ui/library-panel.ts";
import { setupThemeToggle } from "./ui/theme.ts";
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
const drawer = setupLibraryDrawer(library, stats, () => {
  drawer.render();
  refreshStars();
  updateTasteStatus();
});
const batchStars = createBatchStars(stats);
const historyBuffer = createHistoryBuffer((generatorId, values) => {
  library.addToHistory(generatorId, values); // ignored for sensitive generators
  drawer.render();
});
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
/**
 * How the visible results were picked; stars are credited to this mode in the
 * stats. null = warm-up (fewer than MIN_FAVOURITES favourites): not counted,
 * because learning couldn't have been on — counting it would make random mode
 * look better than it is.
 */
let currentMode: Mode | null = null;
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
  if (!tasteToggle.checked) tasteStatus.textContent = "Taste learning is off. Results are fully random.";
  else if (n < MIN_FAVOURITES) {
    const more = MIN_FAVOURITES - n;
    tasteStatus.textContent = `Star ${more} more result${more === 1 ? "" : "s"} you like and new results will start to match your taste.`;
  } else {
    tasteStatus.textContent = `Ranked by similarity to your ${n} favourites. A quarter are random picks, so you still see new styles.`;
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

  readOptions = renderFields(fieldsEl, current, sessionOptions.get(current.id) ?? current.defaults);
  byId("secretNote").hidden = !current.sensitive;
  generate();
}

// Only generator ids switch generator; other hashes (e.g. the "#main" skip link) are page anchors.
window.addEventListener("hashchange", () => {
  const id = location.hash.slice(1);
  if (findGenerator(id)) selectGenerator(id);
});

// ---- Generating ----

/** Plain random results, or a bigger pool ranked by the user's taste. */
function pickResults(opts: Options, count: number): { picked: RankedResult[]; shortBy: number; mode: Mode | null } {
  const favourites = favouritesFor(current);
  const canLearn = !current.sensitive && favourites.length >= MIN_FAVOURITES;
  const learning = canLearn && tasteToggle.checked;

  if (!learning) {
    const { values, shortBy } = generateBatch(current, opts, count, secureRng);
    return { picked: values.map(value => ({ value, match: 0, source: "explore" })), shortBy, mode: canLearn ? "random" : null };
  }
  // Leave out names already starred, so learning surfaces new ones.
  const known = new Set(favourites);
  const pool = generateBatch(current, opts, count * POOL_FACTOR, secureRng).values.filter(v => !known.has(v));
  const picked = rankByTaste(pool, trainTaste(favourites), count, secureRng);
  return { picked, shortBy: count - picked.length, mode: "taste" };
}

function generate(): void {
  const opts = readOptions();
  sessionOptions.set(current.id, opts);
  const count = Number(countInput.value);
  updateTasteStatus();

  const error = validateOptions(current, opts);
  formError.textContent = error ?? "";
  if (error) return;

  try {
    const { picked, shortBy, mode } = pickResults(opts, count);
    currentMode = mode;
    batchStars.newBatch(mode);
    batchNote.textContent = shortBy > 0 ? `Only ${picked.length} different results are possible with these options.` : "";
    showResults(picked, opts);
    byId("resultCount").textContent = String(picked.length);
    announcer.textContent = `${picked.length} new ${current.name.toLowerCase()} results`;
    if (mode) stats.recordShown(mode, picked.length);
    historyBuffer.offer(current.id, picked.map(p => p.value));
  } catch (e) {
    if (!(e instanceof GenerationError)) throw e;
    formError.textContent = e.message;
  }
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

function showResults(picked: RankedResult[], opts: Options): void {
  const learning = currentMode === "taste";
  shown = picked.map(p => p.value);

  results.replaceChildren(...picked.map(({ value, match, source }, i) => {
    const note = current.describe?.(value, opts);
    const noteEl = note
      ? h("span", { class: "note" },
        note.meter !== undefined
          ? h("span", { class: "meter", "data-tone": String(note.tone ?? 2), "aria-hidden": "true" },
            h("span", { style: `width:${Math.round(note.meter * 100)}%` }))
          : "",
        note.text)
      : "";

    // `match` is a rank within the generated pool, so say "Top N%" rather than claiming "N% your style".
    const top = Math.max(1, 100 - match);
    const tasteBadge = learning
      ? h("span", {
        class: `taste-badge ${source}`,
        title: source === "taste"
          ? `Ranked in the top ${top}% of the candidates generated, by similarity to your favourites`
          : "Picked at random on purpose, so you also see styles outside your current favourites",
      }, source === "taste" ? icon("sparkle") : icon("shuffle"), source === "taste" ? `Top ${top}%` : "Explore")
      : "";

    const meta = h("span", { class: "result-meta" },
      // Length matters for handles and repo names (platform limits), not for multi-word values.
      current.sensitive || value.includes(" ") ? "" : h("span", { title: "Characters" }, `${value.length}`),
      h("span", { class: "copy-indicator" }, icon("copy")),
    );

    const label = current.sensitive ? "Copy password" : `Copy ${value}`;
    const main = h("button", { type: "button", class: "result-main", "aria-label": label, title: "Click to copy" },
      tasteBadge, h("span", { class: "value" }, value), meta, noteEl);
    main.addEventListener("click", async () => {
      const ok = await copyText(value);
      if (!ok) {
        toast("Couldn't copy. Try selecting the text instead.", "error");
        return;
      }
      historyBuffer.commit();
      flashCopied(item);
      announcer.textContent = current.sensitive ? "Password copied" : `Copied ${value}`;
    });

    const item = h("li", { class: "result", style: `--i:${i}` },
      h("span", { class: "result-index", "aria-hidden": "true" }, String(i + 1).padStart(2, "0")),
      main,
    );
    if (!current.sensitive) {
      const star = h("button", { type: "button", class: "icon-btn star", "data-value": value });
      star.addEventListener("click", () => {
        const saved = library.toggleFavourite(current.id, value);
        batchStars.toggled(value, saved);
        historyBuffer.commit();
        const n = favouritesFor(current).length;
        if (saved && tasteToggle.checked && n === MIN_FAVOURITES) toast("Taste learning is now on for new results");
        else if (saved && !session && !guestWarned) {
          guestWarned = true;
          toast("Saved for this visit only. Sign in to keep favourites.");
        }
        refreshStars();
        drawer.render();
        updateTasteStatus();
      });
      item.append(star);
    } else {
      item.append(h("span", {}));
    }
    return item;
  }));
  refreshStars();
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
accountButton.addEventListener("click", async () => {
  if (!session) {
    auth.show();
    return;
  }
  historyBuffer.commit();
  const name = session.profile.name;
  await session.saved(); // finish encrypting the latest changes before letting go of the key
  session = null;
  savedStore.use(memoryStore());
  guestWarned = false;
  savedItemsChanged();
  toast(`Signed out. ${name}'s saved names are locked.`);
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
  if (drawer.isOpen() || document.querySelector("dialog[open]")) return;
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
selectGenerator(location.hash.slice(1));
drawer.render();
// Opening the app shows the sign-in screen when there's something to unlock (or old items to move in).
if (profiles.list().length > 0) auth.show("signin");
else if (profiles.legacyItemCount() > 0) auth.show("create");
