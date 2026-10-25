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
