import { nameWords } from "./logo.ts";

/**
 * Say a name aloud with the browser's own speech voices, which work offline,
 * so nothing is sent anywhere. Prefers an Indian English voice when there is
 * one, so Hindi words like "saathi" are read more naturally.
 */
export const canSpeak = () => "speechSynthesis" in window;

/** How a name should be read: "vesper_flux99" → "vesper flux 99", "FormSaathi" → "Form Saathi". */
export function spokenForm(name: string): string {
  return nameWords(name).join(" ").replace(/([a-z])(\d)/gi, "$1 $2");
}

export function speak(name: string): void {
  if (!canSpeak()) return;
  speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(spokenForm(name));
  const voices = speechSynthesis.getVoices();
  utterance.voice = voices.find(v => v.lang === "en-IN") ?? voices.find(v => v.lang.startsWith("en")) ?? null;
  utterance.rate = 0.9;
  speechSynthesis.speak(utterance);
}
