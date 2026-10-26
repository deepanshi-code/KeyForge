import type { KeyValueStore } from "./library.ts";

/**
 * Local profiles with a password. There is no server: each profile's saved
 * items (favourites, history, insights) live in this browser, encrypted with
 * a key made from the profile's password. Without the password they can't be
 * read, and opening the app shows nothing until someone signs in.
 *
 *   password + random salt ──PBKDF2 (600,000 rounds)──▶ AES-256 key
 *   saved items (JSON) ──AES-GCM with that key──▶ stored in localStorage
 *
 * PBKDF2 is deliberately slow, so guessing passwords takes ages. AES-GCM also
 * detects tampering: decrypting with the wrong key fails instead of returning
 * garbage — that failure is how a wrong password is detected.
 *
 * Limits, stated honestly: this protects saved items from anyone else using
 * this browser. It doesn't sync between devices, and a forgotten password
 * can't be recovered (there's nobody to ask) — the profile can only be deleted.
 */
export const PBKDF2_ITERATIONS = 600_000; // OWASP's current recommendation for PBKDF2-SHA256
export const MIN_PASSWORD_LENGTH = 8;
export const MAX_NAME_LENGTH = 30;

const PROFILES_KEY = "toolkit:profiles";
const vaultKey = (id: string) => `toolkit:vault:${id}`;
/** Where saved items lived, unencrypted, before profiles existed. Moved into the first new profile. */
const BACKUP_FORMAT = "keyforge-backup";
export const LEGACY_KEYS = ["toolkit:favourites", "toolkit:history", "toolkit:stats"] as const;

export interface Profile {
  id: string;
  name: string;
  /** Base64. Random per profile, so the same password gives different keys. */
  salt: string;
  iterations: number;
  createdAt: number;
}

interface Sealed {
  iv: string;
  data: string;
}

export interface Session {
  profile: Profile;
  /** The profile's decrypted items; every change is re-encrypted and saved. */
  store: KeyValueStore;
  /** Resolves once all changes so far are encrypted and written. */
  saved(): Promise<void>;
}

/** Thrown with a message that can be shown to the user as-is. */
export class ProfileError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProfileError";
  }
}

// ---- Small helpers ----

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

function fromBase64(text: string): Uint8Array<ArrayBuffer> {
  const binary = atob(text);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

const randomBytes = (n: number) => crypto.getRandomValues(new Uint8Array(n));

async function deriveKey(password: string, salt: Uint8Array<ArrayBuffer>, iterations: number): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations },
    base,
    { name: "AES-GCM", length: 256 },
    false, // the key can't be exported, even by code running on the page
    ["encrypt", "decrypt"],
  );
}

async function seal(key: CryptoKey, text: string): Promise<Sealed> {
  const iv = randomBytes(12); // must be fresh for every encryption
  const data = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, encoder.encode(text));
  return { iv: toBase64(iv), data: toBase64(new Uint8Array(data)) };
}

/** Throws if the key is wrong or the data was changed. */
async function unseal(key: CryptoKey, sealed: Sealed): Promise<string> {
  const data = await crypto.subtle.decrypt({ name: "AES-GCM", iv: fromBase64(sealed.iv) }, key, fromBase64(sealed.data));
  return decoder.decode(data);
}

function isProfile(x: unknown): x is Profile {
  if (typeof x !== "object" || x === null) return false;
  const p = x as Record<string, unknown>;
  return typeof p.id === "string" && typeof p.name === "string" && typeof p.salt === "string" &&
    typeof p.iterations === "number" && typeof p.createdAt === "number";
}

/** An in-memory store, e.g. for guests (forgotten when the tab closes). */
export function memoryStore(initial: Record<string, string> = {}): KeyValueStore & { entries(): Record<string, string> } {
  const data = new Map(Object.entries(initial));
  return {
    getItem: key => data.get(key) ?? null,
    setItem: (key, value) => void data.set(key, value),
    removeItem: key => void data.delete(key),
    entries: () => Object.fromEntries(data),
  };
}

/**
 * A store whose backing store can be swapped (guest ↔ signed-in profile), so
 * the library and stats keep working unchanged when the user signs in or out.
 */
export function createSwitchableStore(initial: KeyValueStore) {
  let target = initial;
  return {
    getItem: (key: string) => target.getItem(key),
    setItem: (key: string, value: string) => target.setItem(key, value),
    removeItem: (key: string) => target.removeItem(key),
    use(store: KeyValueStore): void {
      target = store;
    },
  };
}

// ---- Profiles ----

export function createProfiles(device: KeyValueStore, iterations = PBKDF2_ITERATIONS) {
  function list(): Profile[] {
    try {
      const parsed: unknown = JSON.parse(device.getItem(PROFILES_KEY) ?? "[]");
      return Array.isArray(parsed) ? parsed.filter(isProfile) : [];
    } catch {
      return [];
    }
  }

  /** Opens a session: decrypted items in memory, re-encrypted on every change. */
  function openSession(profile: Profile, key: CryptoKey, items: Record<string, string>): Session {
    const memory = memoryStore(items);
    let chain = Promise.resolve();
    const save = () => {
      // One save at a time, in order, so an older snapshot can never overwrite a newer one.
      chain = chain
        .then(async () => device.setItem(vaultKey(profile.id), JSON.stringify(await seal(key, JSON.stringify(memory.entries())))))
        .catch(() => {
          // Storage full or blocked: changes stay in memory for this visit.
        });
    };
    return {
      profile,
      store: {
        getItem: memory.getItem,
        setItem(k, v) {
          memory.setItem(k, v);
          save();
        },
        removeItem(k) {
          memory.removeItem(k);
          save();
        },
      },
      saved: () => chain,
    };
  }

  /** How many saved items are still stored unencrypted from before profiles existed. */
  function legacyItemCount(): number {
    let n = 0;
    for (const key of ["toolkit:favourites", "toolkit:history"]) {
      try {
        const parsed: unknown = JSON.parse(device.getItem(key) ?? "[]");
        if (Array.isArray(parsed)) n += parsed.length;
      } catch {
        // corrupted: nothing to move
      }
    }
    return n;
  }

  return {
    list,
    legacyItemCount,

    /** Creates a profile and signs in. Unencrypted items from before are moved into it. */
    async create(name: string, password: string): Promise<{ session: Session; moved: number }> {
      const cleanName = name.trim().replace(/\s+/g, " ");
      if (!cleanName) throw new ProfileError("Enter a profile name.");
      if (cleanName.length > MAX_NAME_LENGTH) throw new ProfileError(`Profile names can be at most ${MAX_NAME_LENGTH} characters.`);
      const profiles = list();
      if (profiles.some(p => p.name.toLowerCase() === cleanName.toLowerCase())) {
        throw new ProfileError("A profile with that name already exists on this device.");
      }
      if (password.length < MIN_PASSWORD_LENGTH) {
        throw new ProfileError(`Use a password of at least ${MIN_PASSWORD_LENGTH} characters.`);
      }

      const salt = randomBytes(16);
      const profile: Profile = {
        id: toBase64(randomBytes(9)).replace(/[+/=]/g, "x"),
        name: cleanName,
        salt: toBase64(salt),
        iterations,
        createdAt: Date.now(),
      };
      const key = await deriveKey(password, salt, iterations);

      const moved = legacyItemCount();
      const items: Record<string, string> = {};
      for (const k of LEGACY_KEYS) {
        const value = device.getItem(k);
        if (value !== null) items[k] = value;
      }

      device.setItem(vaultKey(profile.id), JSON.stringify(await seal(key, JSON.stringify(items))));
      device.setItem(PROFILES_KEY, JSON.stringify([...profiles, profile]));
      // Only delete the plain copies once the encrypted copy is safely written.
      for (const k of LEGACY_KEYS) device.removeItem(k);

      return { session: openSession(profile, key, items), moved };
    },

    /** Signs in. Returns null if the password is wrong. */
    async unlock(id: string, password: string): Promise<Session | null> {
      const profile = list().find(p => p.id === id);
      if (!profile) throw new ProfileError("That profile no longer exists.");
      const key = await deriveKey(password, fromBase64(profile.salt), profile.iterations);
      try {
        const sealed = JSON.parse(device.getItem(vaultKey(profile.id)) ?? "null") as Sealed | null;
        // No vault yet (it was cleared outside the app): nothing to protect, start empty.
        const items: unknown = sealed ? JSON.parse(await unseal(key, sealed)) : {};
        return openSession(profile, key, typeof items === "object" && items !== null ? (items as Record<string, string>) : {});
      } catch {
        return null; // wrong password (decryption failed)
      }
    },

    /**
     * An encrypted backup file: the profile's salt plus its already-encrypted
     * items. Safe to keep anywhere — it can only be opened with the password.
     */
    async backup(session: Session): Promise<string> {
      await session.saved();
      const sealed = JSON.parse(device.getItem(vaultKey(session.profile.id)) ?? "null") as Sealed | null;
      const { name, salt, iterations } = session.profile;
      return JSON.stringify({ format: BACKUP_FORMAT, version: 1, profile: { name, salt, iterations }, vault: sealed }, null, 2);
    },

    /** Restores a backup as a new profile on this device. Returns null if the password is wrong. */
    async restore(text: string, password: string): Promise<Session | null> {
      let file: { format?: unknown; profile?: Partial<Profile>; vault?: Sealed | null };
      try {
        file = JSON.parse(text);
      } catch {
        throw new ProfileError("That file isn't a KeyForge backup.");
      }
      const p = file.profile;
      if (file.format !== BACKUP_FORMAT || !p || typeof p.salt !== "string" || typeof p.iterations !== "number" || !file.vault) {
        throw new ProfileError("That file isn't a KeyForge backup.");
      }
      const key = await deriveKey(password, fromBase64(p.salt), p.iterations);
      let items: Record<string, string>;
      try {
        items = JSON.parse(await unseal(key, file.vault)) as Record<string, string>;
      } catch {
        return null; // wrong password
      }
      const profiles = list();
      const base = (typeof p.name === "string" && p.name.trim()) || "Restored profile";
      let name = base;
      for (let n = 2; profiles.some(x => x.name.toLowerCase() === name.toLowerCase()); n++) name = `${base} (${n})`;
      const profile: Profile = {
        id: toBase64(randomBytes(9)).replace(/[+/=]/g, "x"),
        name: name.slice(0, MAX_NAME_LENGTH),
        salt: p.salt,
        iterations: p.iterations,
        createdAt: Date.now(),
      };
      device.setItem(vaultKey(profile.id), JSON.stringify(file.vault));
      device.setItem(PROFILES_KEY, JSON.stringify([...profiles, profile]));
      return openSession(profile, key, items);
    },

    /** Deletes a profile and its saved items. Can't be undone. */
    remove(id: string): void {
      device.removeItem(vaultKey(id));
      device.setItem(PROFILES_KEY, JSON.stringify(list().filter(p => p.id !== id)));
    },
  };
}

export type Profiles = ReturnType<typeof createProfiles>;
