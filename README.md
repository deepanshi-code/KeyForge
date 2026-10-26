# KeyForge

**Forge your online identity.** Unique usernames, project names, team names, personas and secure passwords — private, encrypted on your device, and it learns your taste.

**Live demo:** https://deepanshi-code.github.io/KeyForge/ · **Code:** https://github.com/deepanshi-code/KeyForge

One private platform for naming your online identity and projects: **unique usernames, project names, team names, person names, complete personas and secure passwords**. It **learns your taste** from the names you star, works offline, and installs like an app. Everything runs in your browser: **password-protected profiles** keep your saved names encrypted on your device, and there's no server. Nothing you generate leaves your device unless you click **Check** to see if a name is taken.

**Who it's for:** students and developers who need a name they'll actually use (a GitHub or Instagram handle, a repo or app name, a hackathon team name) or realistic fake personas for test data, without signing up anywhere or handing their ideas to a server.

> This started as a beginner password generator in plain HTML/CSS/JS and was rebuilt as a modular TypeScript app.

## Features

| Generator | Highlights |
|---|---|
| 👤 **Username** | Professional / gamer / minimal / cute styles. Built around your name (`builtbydeepa`, `deepyx`) and interests. **Platform presets** follow the real rules of Instagram, X, GitHub and Discord (length, allowed characters, no `..` or edge hyphens). |
| 🚀 **Project name** | From your keywords, with five naming techniques (below). PascalCase / lowercase / kebab-case. |
| 🏆 **Team name** | Six themes (tech, esports, sports, space, mythology, general). The **team member count** shapes the name: *Quantum Quartet*, *Trio of Titans*, *The Five Phoenixes*, *Krakens VII*. Alliteration. |
| 🎭 **Persona** | Combines the other generators into one fake identity: `Thea Ashford · @hellothea · thea.ashford@example.com`. Uses `example.com` (reserved for testing, RFC 2606), so emails can never reach a real person. **Download 100 as CSV** (name, username, email) for test data. |
| 🪪 **Person name** | Indian and international names, filtered by gender. Common, uncommon or **invented** first names. |
| 🔐 **Password** | `crypto.getRandomValues()` with rejection sampling. Every selected character type guaranteed. Strength meter based on entropy. |

### ✨ Learns your taste (on-device)
Star 3 or more names and the app starts learning what you like:
1. It generates **6× more candidates** than you asked for.
2. A small **character-trigram model trained only on your favourites** scores each candidate by how much it "sounds like" them, with a nudge towards similar lengths.
3. **75%** of results are the best matches. **25%** are drawn at random from the same candidates, so you still see new styles and don't get stuck in a bubble. The two are shuffled together.
4. **"Why this?"** Each result says which favourites it resembles (*Similar to sapphire_comet, sable_tanuki*), using shared letter-triples (Jaccard similarity).

Example: after starring `sapphire_comet`, `sable_tanuki` and `iridescent_orca`, the next batch was `sapphire_ember`, `sapphire_wyvern`, `sable_axolotl`, `sable_paradox`, plus one exploration pick.

Nothing leaves your device. The model is rebuilt from your favourites each time, in milliseconds.

### 📈 Measured, not just claimed — with a fair test
The **Insights** tab answers "does taste learning actually help?" using **interleaving**, the method search engines use to compare rankings:
- Every learning batch mixes **taste picks** with **random picks drawn from the whole candidate pool**, in **shuffled order**. Both groups are seen at the same moment, in random positions.
- It's **blind**: results aren't labelled by group, and every result gets the same "Similar to…" explanation, so you can't tell which group a name came from.
- Insights compares each group's star rate, shows a **95% range (Wilson interval)** for each, and runs a **two-proportion z-test**. It only says "taste learning is working" when p < 0.05, and asks for more data below 20 results per group.

**How this was fixed, and why it matters.** The first version compared "learning on" with "learning off". That was biased twice over: the user decided when each mode ran (self-selection), and the random picks came only from the *lowest-ranked leftovers*, which made learning look better than it was. Both problems were found in review and replaced with the design above. Old statistics aren't carried over.

### 🔒 Private profiles (encrypted, no server)
Opening the app shows a **sign-in screen**. Your favourites, history and insights stay locked until you sign in, so nobody else using the same browser can see them.
- Each profile has a password. A key is made from it with **PBKDF2-SHA256 (600,000 rounds, random salt)**, and saved items are encrypted with **AES-256-GCM** using the browser's Web Crypto API (`src/core/vault.ts`).
- A wrong password is detected because AES-GCM decryption fails. The password itself is never stored.
- Signing out, closing the tab or reloading locks everything again. Without signing in you can still generate. Stars are kept for that visit only, and they merge into your profile if you sign in.
- Names saved before profiles existed are moved into the first profile you create, and the unencrypted copy is deleted.
- **Encrypted backup:** *Saved → Backup* downloads the profile's salt and its already-encrypted items. The file is useless without the password, and *Restore from a backup file* on the sign-in screen moves a profile to another device or browser.
- **Auto-lock** after 15 minutes without activity. A **password strength meter** helps when creating a profile, flagging common passwords, repeats and runs.
- **Limits:** no automatic sync between devices (use a backup), and a forgotten password can't be recovered — the profile can only be deleted.

### 🌐 Is the name taken? (optional)
Click the globe on a username or project name to check **GitHub** (users and orgs), **npm** (packages) and **.com** (via Google's public DNS-over-HTTPS). It calls those public APIs straight from your browser (still no KeyForge server), and only after you agree once, because the name is sent to them. Results are hints, not guarantees: rate-limited or offline shows as *couldn't check*, never as *free*.

### Uniqueness levels
Name generators have a **Uniqueness** option:
- **Familiar:** everyday words (`clever_owl`)
- **Rare** (default): real but uncommon words (`stormborn_tanuki`, `Umbral Wraiths`)
- **Invented:** brand-new words from a Markov model (`vespyra`, `Glaceda`)

### Project-name techniques
| Technique | How it works | Example |
|---|---|---|
| Invented word | Markov-generated word, or a keyword reshaped into a brand | Vespyra, Notora |
| Blended words | Overlaps two words at a shared letter | cloud + data → **Cloudata** |
| Two words joined | Compound | **CodeForge** |
| Prefix / suffix | Adds a start or ending | **Noteify**, **OmniNote** |
| Latin & Greek roots | Classic-sounding roots | **LumenStack** |

"Surprise me" mixes all of them, weighted towards invented words.

### Interface
- **Clean workbench layout:** a sidebar of generators, options on the left, results as a numbered list. Line icons instead of emoji, one accent colour, very little motion.
- **Light, dark or system theme**, applied before the page paints, so it never flashes.
- **Live results:** results update as you change options. Click any result to copy it (a check mark confirms), star it to save it, or **Copy all** to get the whole list, one per line. **Reset** puts the options back to their defaults.
- **Keyboard:** **R** regenerates, **Enter** in a text box regenerates, **Esc** closes the drawer or dialog.
- Usernames and project names show their length, so you can check platform limits at a glance. On phones, results appear above the options.
- **Saved drawer:** favourites, history and insights, with JSON export and import and an encrypted backup. Passwords are never saved or exported.
- **CSV download:** 100 results with the current options in one click (not for passwords). Values a spreadsheet would run as formulas are neutralised (CSV-injection safe).
- **Installable and offline (PWA):** install it from the browser menu on phone or desktop. A service worker keeps a copy, so it works with no internet.
- Works on phones, supports keyboard and screen readers, and turns animations off if your system asks for reduced motion.

## How invented words work (Markov chain)

`src/core/markov.ts` learns which letter tends to follow each **pair** of letters in a list of training words (myths, stars, gems, birds…). From "nova" it learns `^^→n`, `^n→o`, `no→v`, `ov→a`, `va→end`.

To invent a word, it starts at the beginning marker and keeps picking a letter that followed the last two letters somewhere in the training data. Common transitions get picked more often. The result **sounds like** the training words but is checked so it's **never one of them**. Awkward results (`aaa`, four consonants in a row) and blocked words are rejected.

The same model, trained on name lists, invents realistic first names: *Vedarth*, *Nehita*, *Kunavya*.

## Design

Every generator implements one interface:

```ts
interface Generator<O extends Options> {
  id: string;
  name: string;
  icon: string;
  description: string;
  sensitive: boolean;             // secrets: never saved
  fields: OptionField[];          // the form (sliders, toggles, pills…) is built from this
  defaults: O;
  validate?(opts: O): string | null;
  generate(opts: O, rng: Rng): string;
  describe?(value: string, opts: O): ResultNote;   // e.g. strength meter
}
```

To add a generator, write one file in `src/generators/` and list it in `src/core/registry.ts`. The UI, validation, batching and favourites work automatically, and the **contract tests** check the new generator straight away.

Other design decisions:
- **Two random sources:**
  - `secureRng` uses `crypto.getRandomValues()`, and the app uses it for everything.
  - `seededRng` is deterministic and only used in tests.
  - Both use **rejection sampling**, because `x % n` is slightly biased.
- **Password strength is entropy:** `length × log2(pool size)` bits. Under 40 is Weak, 40–59 Medium, 60–79 Strong, 80+ Very strong.
- **Profanity filter with an allowlist.** Joined words are checked against a blocklist. The tests caught the *Scunthorpe problem* twice: the real names *Ishita* and *Lakshit* contain a blocked substring, so `src/data/blocklist.ts` allowlists them.
- **Composition over duplication.** Persona reuses the Person name and Username generators instead of copying their logic, and the contract tests covered it automatically.
- **Soft alliteration.** Requiring alliteration made the same few team names repeat ("Quantum Quartet" ×4), so it's now a preference with a fallback.

## Project structure

```
src/
├── core/          interfaces, RNG, Markov model, taste model, stats, uniqueness, validation, batching, entropy, storage
├── generators/    one file per generator + tests
├── data/          word lists, names, Markov training words, blocklist
├── ui/            form builder, icons, theme toggle, drawer, toasts
├── styles/        main.css (light and dark themes are CSS custom properties)
└── main.ts        wires the UI together
e2e/               browser tests (Playwright) and accessibility scans (axe)
docs/              user-study kit
public/            app manifest, icons, service worker (offline support)
```

## Run it

Requires Node.js 22.12 or later.

```bash
npm install
npm run dev       # http://localhost:5173
npm test          # 130 unit tests
npm run test:e2e  # 7 browser tests, incl. accessibility (first run: npx playwright install chromium)
npm run lint      # Biome
npm run build     # production build in dist/
```

> **Don't open the root `index.html` directly.** It loads TypeScript source, which browsers can't run, so it only shows a short notice.
>
> `npm run build` produces **`dist/index.html`**: a single self-contained file with the JS and CSS inlined. It works when double-clicked, and it's the file you deploy.

## Testing

- **130 unit tests** (Vitest), including:
  - chi-square uniformity tests for both random sources
  - a modulo-bias regression test
  - the Markov model never returning a training word
  - the taste model ranking favourite-like names higher; random picks drawn from the **whole** pool (the best candidate can be a random pick); no position advantage for taste picks
  - Wilson intervals and the two-proportion z-test against known values
  - platform rules for every platform × separator combination
  - encryption at rest, wrong passwords, separate profiles, backup and restore
  - CSV escaping and formula neutralising; availability checks never reporting "free" on errors
  - team names always reflecting the member count (2–12)
  - every theme, size and uniqueness combination
  - storage and import/export
- **Contract tests** run every registered generator through the same checks: valid defaults, every option value works, out-of-range numbers are rejected, and output is clean.
- **7 browser tests** (Playwright, on the production build): generate and regenerate with R; GitHub preset output; passwords never saved or exported; create profile → star → reload (locked) → wrong password refused → right password restores the favourite.
- **Accessibility:** axe scans the main screen in light and dark mode and the sign-in dialog, and fails on any serious issue. Its first run found low-contrast small text and buttons whose spoken names didn't match their visible text; both were fixed.
- **CI:** lint, typecheck, unit tests, browser tests and build must all pass before anything is deployed.

## Deploy (free, automatic)

The site is published to **GitHub Pages** by `.github/workflows/deploy.yml`. Every push to `main` runs lint, typecheck, unit and browser tests, builds, and publishes the built files to the `gh-pages` branch. If anything fails, the live site stays on the last working version.

One-time setup: in the repo, open **Settings → Pages**, set **Source** to **Deploy from a branch**, and choose **gh-pages** / **(root)**. The live link is https://deepanshi-code.github.io/KeyForge/.

Open it on your phone and choose **Install / Add to Home screen** to use it like an app, offline too.

## Limitations and roadmap

- **Generated names may already be taken.** Uniqueness is guaranteed within a batch; the optional Check covers GitHub, npm and .com only.
- **Some invented words are odd**, because the Markov model is small and character-based.
- **The name lists are hand-written.** v2: a larger, licensed dataset.
- **Taste learning only uses stars.** It doesn't learn from names you skip, and it needs a few favourites before it helps.
- **Insights measures one person at a time.** It's a fair within-person test, but "taste learning helps people" needs a study across users: see the ready-to-run kit in [`docs/user-study.md`](docs/user-study.md). **Results: not run yet.**

**v2 ideas:**
- Run the user study and publish the results here
- Hindi interface
- Learn from skipped names too, not just stars
