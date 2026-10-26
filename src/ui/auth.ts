import { chosenPasswordStrength } from "../core/entropy.ts";
import { ProfileError, type Profiles, type Session } from "../core/vault.ts";
import { byId, h } from "./dom.ts";
import { icon } from "./icons.ts";
import { toast } from "./toast.ts";

type Mode = "signin" | "create" | "restore";

/**
 * The sign-in / create-profile / restore-backup dialog. Uses a native
 * <dialog>, which traps focus, closes on Esc and makes the rest of the page
 * inert for free.
 */
export function setupAuthDialog(profiles: Profiles, onSignedIn: (session: Session, moved: number) => void) {
  const dialog = byId<HTMLDialogElement>("authDialog");
  const form = byId<HTMLFormElement>("authForm");
  const title = byId("authTitle");
  const intro = byId("authIntro");
  const profileField = byId("authProfileField");
  const profileSelect = byId<HTMLSelectElement>("authProfile");
  const nameField = byId("authNameField");
  const nameInput = byId<HTMLInputElement>("authName");
  const passwordInput = byId<HTMLInputElement>("authPassword");
  const confirmField = byId("authConfirmField");
  const confirmInput = byId<HTMLInputElement>("authConfirm");
  const strength = byId("authStrength");
  const error = byId("authError");
  const submit = byId<HTMLButtonElement>("authSubmit");
  const switchButton = byId<HTMLButtonElement>("authSwitch");
  const restoreButton = byId<HTMLButtonElement>("authRestore");
  const restoreFile = byId<HTMLInputElement>("authRestoreFile");
  const deleteButton = byId<HTMLButtonElement>("authDelete");
  let mode: Mode = "signin";
  /** The backup file being restored, read into memory. */
  let backup: { name: string; text: string } | null = null;

  byId("authClose").append(icon("x"));

  // Show/hide password (applies to both boxes, so confirming is easy too).
  const reveal = byId<HTMLButtonElement>("authReveal");
  const setRevealed = (on: boolean) => {
    passwordInput.type = confirmInput.type = on ? "text" : "password";
    reveal.replaceChildren(icon(on ? "eye-off" : "eye"));
    reveal.setAttribute("aria-pressed", String(on));
    reveal.setAttribute("aria-label", on ? "Hide password" : "Show password");
  };
  setRevealed(false);
  reveal.addEventListener("click", () => {
    setRevealed(passwordInput.type === "password");
    passwordInput.focus();
  });

  // Passwords are case-sensitive, so warn when Caps Lock would silently change one.
  const capsNote = byId("capsNote");
  for (const input of [passwordInput, confirmInput]) {
    for (const type of ["keydown", "keyup"] as const) {
      input.addEventListener(type, e => {
        capsNote.hidden = !e.getModifierState("CapsLock");
      });
    }
  }

  // Strength meter, only while creating: helps people pick a password worth the encryption.
  passwordInput.addEventListener("input", () => {
    if (mode !== "create" || passwordInput.value === "") {
      strength.hidden = true;
      return;
    }
    const { score, label } = chosenPasswordStrength(passwordInput.value);
    strength.hidden = false;
    strength.dataset.tone = String(score);
    strength.replaceChildren(
      h("span", { class: "meter", "data-tone": String(score), "aria-hidden": "true" }, h("span", { style: `width:${(score + 1) * 25}%` })),
      `Password strength: ${label}`,
    );
  });

  function render(): void {
    const list = profiles.list();
    if (list.length === 0 && mode === "signin") mode = "create";
    const creating = mode === "create";
    const restoring = mode === "restore";

    title.textContent = creating ? "Create a profile" : restoring ? "Restore a backup" : "Sign in";
    const legacy = profiles.legacyItemCount();
    intro.textContent = restoring
      ? `Restoring “${backup?.name ?? "backup"}”. Enter the password the profile had when the backup was made.`
      : creating
        ? legacy > 0
          ? `You have ${legacy} saved item${legacy === 1 ? "" : "s"} on this device from before. Create a profile and they'll move into it, encrypted.`
          : "A profile keeps your favourites and history private to you on this device."
        : "Your saved names are locked. Choose your profile and enter its password.";

    profileSelect.replaceChildren(...list.map(p => h("option", { value: p.id }, p.name)));
    profileField.hidden = creating || restoring;
    nameField.hidden = !creating;
    confirmField.hidden = !creating;
    strength.hidden = true;
    passwordInput.autocomplete = creating ? "new-password" : "current-password";
    submit.textContent = creating ? "Create profile" : restoring ? "Restore" : "Sign in";
    switchButton.textContent = mode === "signin" ? "Create a new profile" : list.length > 0 ? "Back to sign in" : "Create a new profile";
    switchButton.hidden = creating && list.length === 0;
    restoreButton.hidden = restoring;
    deleteButton.hidden = mode !== "signin";
    error.textContent = "";
  }

  function reset(): void {
    setRevealed(false);
    capsNote.hidden = true;
    passwordInput.value = "";
    confirmInput.value = "";
    nameInput.value = "";
    error.textContent = "";
  }

  function show(preferred?: Mode): void {
    mode = preferred ?? "signin";
    if (mode !== "restore") backup = null;
    reset();
    render();
    if (!dialog.open) dialog.showModal();
    (mode === "create" ? nameInput : passwordInput).focus();
  }

  form.addEventListener("submit", async event => {
    event.preventDefault();
    error.textContent = "";
    const current = mode;
    if (current === "create" && passwordInput.value !== confirmInput.value) {
      error.textContent = "The passwords don't match.";
      confirmInput.focus();
      return;
    }

    submit.disabled = true;
    submit.textContent = current === "create" ? "Creating profile…" : current === "restore" ? "Restoring…" : "Signing in…";
    try {
      if (current === "create") {
        const { session, moved } = await profiles.create(nameInput.value, passwordInput.value);
        dialog.close();
        onSignedIn(session, moved);
        return;
      }
      const session = current === "restore"
        ? await profiles.restore(backup?.text ?? "", passwordInput.value)
        : await profiles.unlock(profileSelect.value, passwordInput.value);
      if (!session) {
        error.textContent = "Wrong password. Try again.";
        passwordInput.select();
        return;
      }
      dialog.close();
      if (current === "restore") toast(`Restored “${session.profile.name}” to this device`);
      onSignedIn(session, 0);
    } catch (e) {
      error.textContent = e instanceof ProfileError ? e.message : "Something went wrong. Please try again.";
    } finally {
      submit.disabled = false;
      submit.textContent = mode === "create" ? "Create profile" : mode === "restore" ? "Restore" : "Sign in";
    }
  });

  switchButton.addEventListener("click", () => show(mode === "signin" ? "create" : "signin"));
  restoreButton.addEventListener("click", () => restoreFile.click());
  restoreFile.addEventListener("change", async () => {
    const file = restoreFile.files?.[0];
    restoreFile.value = ""; // allow choosing the same file again
    if (!file) return;
    const text = await file.text();
    let name = "backup";
    try {
      name = (JSON.parse(text) as { profile?: { name?: string } }).profile?.name ?? name;
    } catch {
      // not JSON: restore() will say it isn't a backup
    }
    backup = { name, text };
    show("restore");
  });
  byId("authGuest").addEventListener("click", () => dialog.close());
  byId("authClose").addEventListener("click", () => dialog.close());
  dialog.addEventListener("close", reset);

  deleteButton.addEventListener("click", () => {
    const profile = profiles.list().find(p => p.id === profileSelect.value);
    if (!profile) return;
    if (!confirm(`Delete the profile “${profile.name}” and everything saved in it? This can't be undone.`)) return;
    profiles.remove(profile.id);
    toast(`Deleted profile “${profile.name}”`);
    show();
  });

  return { show };
}
