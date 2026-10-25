# KeyForge

**Forge your online identity.** Unique usernames, project names, team names, personas and secure passwords — private, encrypted on your device, and it learns your taste.

**Live demo:** https://deepanshi-code.github.io/KeyForge/ · **Code:** https://github.com/deepanshi-code/KeyForge

One private platform for naming your online identity and projects: **unique usernames, project names, team names, person names, complete personas and secure passwords**. It **learns your taste** from the names you star, works offline, and installs like an app. Everything runs in your browser: **password-protected profiles** keep your saved names encrypted on your device, and there's no server, so nothing is sent anywhere.

> This started as a beginner password generator in plain HTML/CSS/JS and was rebuilt as a modular TypeScript app.

## Features

| Generator | Highlights |
|---|---|
| 👤 **Username** | Professional / gamer / minimal / cute styles. Built around your name (`builtbydeepa`, `deepyx`) and interests. Fits any max length. |
| 🚀 **Project name** | From your keywords, with five naming techniques (below). PascalCase / lowercase / kebab-case. |
| 🏆 **Team name** | Six themes (tech, esports, sports, space, mythology, general). The **team member count** shapes the name: *Quantum Quartet*, *Trio of Titans*, *The Five Phoenixes*, *Krakens VII*. Alliteration. |
| 🎭 **Persona** | Combines the other generators into one fake identity: `Thea Ashford · @hellothea · thea.ashford@example.com`. Uses `example.com` (reserved for testing, RFC 2606), so emails can never reach a real person. |
| 🪪 **Person name** | Indian and international names, filtered by gender. Common, uncommon or **invented** first names. |
| 🔐 **Password** | `crypto.getRandomValues()` with rejection sampling. Every selected character type guaranteed. Strength meter based on entropy. |

### ✨ Learns your taste (on-device)
Star 3 or more names and the app starts learning what you like:
1. It generates **6× more candidates** than you asked for.
2. A small **character-trigram model trained only on your favourites** scores each candidate by how much it "sounds like" them, with a nudge towards similar lengths.
3. **75%** of results are the best matches, labelled *Top N%*. **25%** are random on purpose (*Explore*), so you still see new styles and don't get stuck in a bubble.

Example: after starring `sapphire_comet`, `sable_tanuki` and `iridescent_orca`, the next batch was `sapphire_ember`, `sapphire_wyvern`, `sable_axolotl`, `sable_paradox`, plus one exploration pick.

Nothing leaves your device. The model is rebuilt from your favourites each time, in milliseconds.

### 📈 Measured, not just claimed
The **Insights** tab compares how often you star results **with** vs **without** taste learning. It works like a small A/B test you run on yourself:
- **Counting starts at 3 favourites.** Before that, learning can't be on, so counting those results would unfairly favour random mode. This bias was found and fixed during testing.
- **It won't draw conclusions early.** Below 30 results per mode, it tells you any difference could be chance.

### 🔒 Private profiles (encrypted, no server)
Opening the app shows a **sign-in screen**. Your favourites, history and insights stay locked until you sign in, so nobody else using the same browser can see them.
- Each profile has a password. A key is made from it with **PBKDF2-SHA256 (600,000 rounds, random salt)**, and saved items are encrypted with **AES-256-GCM** using the browser's Web Crypto API (`src/core/vault.ts`).
- A wrong password is detected because AES-GCM decryption fails. The password itself is never stored.
- Signing out, closing the tab or reloading locks everything again. Without signing in you can still generate. Stars are kept for that visit only, and they merge into your profile if you sign in.
- Names saved before profiles existed are moved into the first profile you create, and the unencrypted copy is deleted.
- **Limits:** profiles exist only in this browser (no sync between devices), and a forgotten password can't be recovered — the profile can only be deleted.

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
- **Saved drawer:** favourites, history and insights, stored only in your browser, with JSON export and import. Passwords are never saved.
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
public/            app manifest, icon, service worker (offline support)
```

## Run it

Requires Node.js 22.12 or later.

```bash
npm install
npm run dev       # http://localhost:5173
npm test          # 89 tests
npm run build     # production build in dist/
```

> **Don't open the root `index.html` directly.** It loads TypeScript source, which browsers can't run, so it only shows a short notice.
>
> `npm run build` produces **`dist/index.html`**: a single self-contained file with the JS and CSS inlined. It works when double-clicked, and it's the file you deploy.

## Testing

- **89 unit tests** (Vitest), including:
  - chi-square uniformity tests for both random sources
  - a modulo-bias regression test
  - the Markov model never returning a training word
  - the taste model ranking favourite-like names higher, and always keeping exploration picks
  - star-rate statistics
  - team names always reflecting the member count (2–12)
  - every theme, size and uniqueness combination
  - storage and import/export
- **Contract tests** run every registered generator through the same checks: valid defaults, every option value works, out-of-range numbers are rejected, and output is clean.

## Deploy (free, automatic)

The site is published to **GitHub Pages** by `.github/workflows/deploy.yml`. Every push to `main` runs the tests, builds, and redeploys. If a test fails, the live site stays on the last working version.

One-time setup: in the repo, open **Settings → Pages** and set **Source** to **GitHub Actions**. The live link is https://deepanshi-code.github.io/KeyForge/.

Open it on your phone and choose **Install / Add to Home screen** to use it like an app, offline too.

## Limitations and roadmap

- **Generated names may already be taken.** Uniqueness is guaranteed within a batch, not globally.
- **Some invented words are odd**, because the Markov model is small and character-based.
- **The name lists are hand-written.** v2: a larger, licensed dataset.
- **Taste learning only uses stars.** It doesn't learn from names you skip, and it needs a few favourites before it helps.
- **Insights is a self-experiment with one user**, not a controlled study. A real evaluation would compare star rates across 10–20 people.

**v2 ideas:**
- Availability check for project names (domain, GitHub, npm) through a rate-limited serverless function
- Hindi interface
