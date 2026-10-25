import { ProfileError, type Profiles, type Session } from "../core/vault.ts";
import { byId, h } from "./dom.ts";
import { icon } from "./icons.ts";
import { toast } from "./toast.ts";

type Mode = "signin" | "create";

/**
 * The sign-in / create-profile dialog. Uses a native <dialog>, which traps
 * focus, closes on Esc and makes the rest of the page inert for free.
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
  const error = byId("authError");
  const submit = byId<HTMLButtonElement>("authSubmit");
  const switchButton = byId<HTMLButtonElement>("authSwitch");
  const deleteButton = byId<HTMLButtonElement>("authDelete");
  let mode: Mode = "signin";

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

  function render(): void {
    const list = profiles.list();
    if (list.length === 0) mode = "create";
    const creating = mode === "create";

    title.textContent = creating ? "Create a profile" : "Sign in";
    const legacy = profiles.legacyItemCount();
    intro.textContent = creating
      ? legacy > 0
        ? `You have ${legacy} saved item${legacy === 1 ? "" : "s"} on this device from before. Create a profile and they'll move into it, encrypted.`
        : "A profile keeps your favourites and history private to you on this device."
      : "Your saved names are locked. Choose your profile and enter its password.";

    profileSelect.replaceChildren(...list.map(p => h("option", { value: p.id }, p.name)));
    profileField.hidden = creating;
    nameField.hidden = !creating;
    confirmField.hidden = !creating;
    passwordInput.autocomplete = creating ? "new-password" : "current-password";
    submit.textContent = creating ? "Create profile" : "Sign in";
    switchButton.textContent = creating ? "Sign in to an existing profile" : "Create a new profile";
    switchButton.hidden = creating && list.length === 0;
    deleteButton.hidden = creating;
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
    reset();
    render();
    if (!dialog.open) dialog.showModal();
    (mode === "create" ? nameInput : passwordInput).focus();
  }

  form.addEventListener("submit", async event => {
    event.preventDefault();
    error.textContent = "";
    const creating = mode === "create";
    if (creating && passwordInput.value !== confirmInput.value) {
      error.textContent = "The passwords don't match.";
      confirmInput.focus();
      return;
    }

    submit.disabled = true;
    submit.textContent = creating ? "Creating profile…" : "Signing in…";
    try {
      if (creating) {
        const { session, moved } = await profiles.create(nameInput.value, passwordInput.value);
        dialog.close();
        onSignedIn(session, moved);
      } else {
        const session = await profiles.unlock(profileSelect.value, passwordInput.value);
        if (!session) {
          error.textContent = "Wrong password. Try again.";
          passwordInput.select();
          return;
        }
        dialog.close();
        onSignedIn(session, 0);
      }
    } catch (e) {
      error.textContent = e instanceof ProfileError ? e.message : "Something went wrong. Please try again.";
    } finally {
      submit.disabled = false;
      submit.textContent = mode === "create" ? "Create profile" : "Sign in";
    }
  });

  switchButton.addEventListener("click", () => show(mode === "create" ? "signin" : "create"));
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
