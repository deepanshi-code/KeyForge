/**
 * Decides which batches reach history. Results regenerate live while the user
 * types or drags a slider, so saving every batch would fill the 100-item
 * history with in-between results nobody looked at. Instead a batch is saved
 * once it has stayed on screen for `settleMs`, or straight away when the user
 * copies or stars something from it. A batch replaced before then is dropped.
 */
export function createHistoryBuffer(
  save: (generatorId: string, values: string[]) => void,
  settleMs = 1500,
) {
  let pending: { generatorId: string; values: string[] } | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;

  function commit(): void {
    clearTimeout(timer);
    if (pending) save(pending.generatorId, pending.values);
    pending = null;
  }

  return {
    /** A new batch is on screen; replaces any batch that hasn't been saved yet. */
    offer(generatorId: string, values: string[]): void {
      clearTimeout(timer);
      pending = { generatorId, values };
      timer = setTimeout(commit, settleMs);
    },
    /** Save the visible batch now (the user acted on it, or the page is closing). */
    commit,
  };
}
