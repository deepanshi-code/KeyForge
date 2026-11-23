import "@fontsource/kalam/700.css";
import type { KeyValueStore } from "../core/library.ts";
import { reducedMotion } from "./ambient.ts";
import { byId } from "./dom.ts";

/**
 * The welcome screen: "नमस्ते" written out by hand, each stroke drawn and then
 * filled like molten metal, ending with KeyForge's mark and a way in. Shown on
 * the first visit; "Replay intro" brings it back. The handwriting font (Kalam,
 * SIL Open Font License) is bundled with the app, so nothing is fetched.
 */
const SEEN_KEY = "toolkit:welcomed";

/** [greeting, language] — the language tag lets screen readers and fonts treat it correctly. */
const GREETINGS: readonly [string, string][] = [["नमस्ते", "hi"]];
/** How long the greeting is written and held before "Welcome to KeyForge" appears. */
const WRITE_MS = 3200;

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export function setupWelcome(device: KeyValueStore, onClose: () => void) {
  const screen = byId("welcome");
  const text = byId("helloText");
  const start = byId<HTMLButtonElement>("welcomeStart");
  let run = 0; // bumps on every open/close, so an old sequence stops by itself

  function close(): void {
    if (screen.hidden) return;
    run++;
    try {
      device.setItem(SEEN_KEY, "1");
    } catch {
      // not remembered; it will show again next time
    }
    screen.classList.add("leaving");
    setTimeout(() => {
      screen.hidden = true;
      screen.classList.remove("leaving", "ended");
      document.body.classList.remove("welcome-open");
      onClose();
    }, 400);
  }

  async function play(id: number): Promise<void> {
    for (const [greeting, lang] of GREETINGS) {
      if (id !== run) return;
      text.textContent = greeting;
      text.setAttribute("lang", lang);
      text.classList.remove("write");
      void text.getBoundingClientRect(); // restart the drawing animation
      text.classList.add("write");
      await wait(WRITE_MS);
    }
    if (id === run) {
      screen.classList.add("ended");
      start.focus();
    }
  }

  function open(): void {
    run++;
    screen.hidden = false;
    screen.classList.remove("ended", "leaving");
    document.body.classList.add("welcome-open");
    if (reducedMotion()) {
      // No animation: show a still greeting and the way in straight away.
      text.textContent = GREETINGS[0][0];
      text.setAttribute("lang", GREETINGS[0][1]);
      text.classList.add("still");
      screen.classList.add("ended");
      start.focus();
      return;
    }
    byId("welcomeSkip").focus();
    void play(run);
  }

  start.addEventListener("click", close);
  byId("welcomeSkip").addEventListener("click", close);
  screen.addEventListener("keydown", e => {
    if (e.key === "Escape") close();
  });
  byId("replayIntro").addEventListener("click", open);

  return {
    /** Shows the welcome on the first visit. Returns whether it did. */
    showIfFirstVisit(): boolean {
      let seen = false;
      try {
        seen = device.getItem(SEEN_KEY) === "1";
      } catch {
        seen = false;
      }
      if (seen) return false;
      open();
      return true;
    },
    open,
  };
}
