import { describe, expect, it } from "vitest";
import { createLibrary } from "./library.ts";
import { createProfiles, createSwitchableStore, memoryStore, ProfileError } from "./vault.ts";

// Few PBKDF2 rounds so the tests run fast; the app uses 600,000.
const ROUNDS = 1000;
const NO_SECRETS = new Set<string>();

describe("profiles", () => {
  it("signs back in with the right password and sees the same saved items", async () => {
    const device = memoryStore();
    const profiles = createProfiles(device, ROUNDS);
    const { session } = await profiles.create("Deepa", "correct horse");
    createLibrary(session.store, NO_SECRETS).toggleFavourite("username", "vesper_flux");
    await session.saved();

    const again = await profiles.unlock(session.profile.id, "correct horse");
    expect(again).not.toBeNull();
    expect(createLibrary(again!.store, NO_SECRETS).favourites().map(f => f.value)).toEqual(["vesper_flux"]);
  });

  it("refuses a wrong password", async () => {
    const profiles = createProfiles(memoryStore(), ROUNDS);
    const { session } = await profiles.create("Deepa", "correct horse");
    expect(await profiles.unlock(session.profile.id, "wrong horse")).toBeNull();
  });

  it("stores saved items encrypted, never as plain text", async () => {
    const device = memoryStore();
    const { session } = await createProfiles(device, ROUNDS).create("Deepa", "correct horse");
    createLibrary(session.store, NO_SECRETS).toggleFavourite("username", "vesper_flux");
    await session.saved();
    expect(JSON.stringify(device.entries())).not.toContain("vesper_flux");
  });

  it("moves items saved before profiles existed into the new profile, then deletes the plain copy", async () => {
    const device = memoryStore();
    createLibrary(device, NO_SECRETS).toggleFavourite("team-name", "Byte Brigade");
    const profiles = createProfiles(device, ROUNDS);
    expect(profiles.legacyItemCount()).toBe(1);

    const { session, moved } = await profiles.create("Deepa", "correct horse");
    expect(moved).toBe(1);
    expect(device.getItem("toolkit:favourites")).toBeNull();
    expect(createLibrary(session.store, NO_SECRETS).favourites().map(f => f.value)).toEqual(["Byte Brigade"]);
  });

  it("keeps each profile's items separate", async () => {
    const profiles = createProfiles(memoryStore(), ROUNDS);
    const a = await profiles.create("Asha", "password-a");
    const b = await profiles.create("Ben", "password-b");
    createLibrary(a.session.store, NO_SECRETS).toggleFavourite("username", "asha_only");
    await a.session.saved();
    const ben = await profiles.unlock(b.session.profile.id, "password-b");
    expect(createLibrary(ben!.store, NO_SECRETS).favourites()).toEqual([]);
  });

  it("rejects short passwords and duplicate names", async () => {
    const profiles = createProfiles(memoryStore(), ROUNDS);
    await expect(profiles.create("Deepa", "short")).rejects.toThrow(ProfileError);
    await profiles.create("Deepa", "correct horse");
    await expect(profiles.create(" deepa ", "another password")).rejects.toThrow(/already exists/);
  });

  it("deletes a profile and its data", async () => {
    const device = memoryStore();
    const profiles = createProfiles(device, ROUNDS);
    const { session } = await profiles.create("Deepa", "correct horse");
    profiles.remove(session.profile.id);
    expect(profiles.list()).toEqual([]);
    expect(Object.keys(device.entries()).filter(k => k.startsWith("toolkit:vault:"))).toEqual([]);
  });
});

describe("switchable store", () => {
  it("lets the same library show a guest's items, then a profile's", () => {
    const guest = memoryStore();
    const profile = memoryStore();
    const store = createSwitchableStore(guest);
    const library = createLibrary(store, NO_SECRETS);
    library.toggleFavourite("username", "guest_pick");
    store.use(profile);
    expect(library.favourites()).toEqual([]);
    store.use(guest);
    expect(library.favourites().map(f => f.value)).toEqual(["guest_pick"]);
  });
});

describe("encrypted backups", () => {
  it("restores a backup on another device with the right password", async () => {
    const thisDevice = createProfiles(memoryStore(), ROUNDS);
    const { session } = await thisDevice.create("Deepa", "correct horse");
    createLibrary(session.store, NO_SECRETS).toggleFavourite("username", "vesper_flux");
    const file = await thisDevice.backup(session);

    const otherDevice = createProfiles(memoryStore(), ROUNDS);
    const restored = await otherDevice.restore(file, "correct horse");
    expect(restored?.profile.name).toBe("Deepa");
    expect(createLibrary(restored!.store, NO_SECRETS).favourites().map(f => f.value)).toEqual(["vesper_flux"]);
    expect(otherDevice.list()).toHaveLength(1);
  });

  it("keeps the backup file unreadable without the password", async () => {
    const device = memoryStore();
    const profiles = createProfiles(device, ROUNDS);
    const { session } = await profiles.create("Deepa", "correct horse");
    createLibrary(session.store, NO_SECRETS).toggleFavourite("username", "vesper_flux");
    const file = await profiles.backup(session);
    expect(file).not.toContain("vesper_flux");
    expect(await createProfiles(memoryStore(), ROUNDS).restore(file, "wrong horse")).toBeNull();
  });

  it("renames a restored profile if the name is already used", async () => {
    const device = memoryStore();
    const profiles = createProfiles(device, ROUNDS);
    const { session } = await profiles.create("Deepa", "correct horse");
    const restored = await profiles.restore(await profiles.backup(session), "correct horse");
    expect(restored?.profile.name).toBe("Deepa (2)");
  });

  it("rejects files that aren't backups", async () => {
    await expect(createProfiles(memoryStore(), ROUNDS).restore("{}", "x")).rejects.toThrow(ProfileError);
    await expect(createProfiles(memoryStore(), ROUNDS).restore("not json", "x")).rejects.toThrow(ProfileError);
  });
});

describe("refusing crafted or damaged data", () => {
  async function backupWith(change: (file: Record<string, unknown>) => void): Promise<string> {
    const profiles = createProfiles(memoryStore(), ROUNDS);
    const { session } = await profiles.create("Deepa", "correct horse");
    const file = JSON.parse(await profiles.backup(session));
    change(file);
    return JSON.stringify(file);
  }

  it("rejects a backup asking for an extreme number of rounds (would freeze the tab)", async () => {
    const file = await backupWith(f => { (f.profile as { iterations: number }).iterations = 1e10; });
    await expect(createProfiles(memoryStore(), ROUNDS).restore(file, "correct horse")).rejects.toThrow(/unsupported security settings/);
  });

  it("rejects non-integer, zero or negative rounds", async () => {
    for (const bad of [0, -5, 1.5]) {
      const file = await backupWith(f => { (f.profile as { iterations: number }).iterations = bad; });
      await expect(createProfiles(memoryStore(), ROUNDS).restore(file, "correct horse")).rejects.toThrow(ProfileError);
    }
  });

  it("rejects a backup with a malformed salt or nonce", async () => {
    const badSalt = await backupWith(f => { (f.profile as { salt: string }).salt = "AAAA"; });
    const badIv = await backupWith(f => { (f.vault as { iv: string }).iv = "AAAA"; });
    await expect(createProfiles(memoryStore(), ROUNDS).restore(badSalt, "x")).rejects.toThrow(/isn't a KeyForge backup/);
    await expect(createProfiles(memoryStore(), ROUNDS).restore(badIv, "x")).rejects.toThrow(/isn't a KeyForge backup/);
  });

  it("won't open a profile whose vault is missing, whatever the password", async () => {
    const device = memoryStore();
    const profiles = createProfiles(device, ROUNDS);
    const { session } = await profiles.create("Deepa", "correct horse");
    device.removeItem(`toolkit:vault:${session.profile.id}`);
    await expect(profiles.unlock(session.profile.id, "any password at all")).rejects.toThrow(/missing or damaged/);
  });

  it("ignores stored profiles with impossible settings", async () => {
    const device = memoryStore();
    const profiles = createProfiles(device, ROUNDS);
    await profiles.create("Deepa", "correct horse");
    const stored = JSON.parse(device.getItem("toolkit:profiles") ?? "[]");
    stored[0].iterations = 1e10;
    device.setItem("toolkit:profiles", JSON.stringify(stored));
    expect(profiles.list()).toEqual([]);
  });
});
