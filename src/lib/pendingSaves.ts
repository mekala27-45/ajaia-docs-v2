// The open editor registers a function here that saves its pending changes.
// Anything that is about to change who the user is (the account switcher)
// awaits flushPendingSaves() first, so edits are stored under the right person.

type Flusher = () => Promise<void>;

const flushers = new Set<Flusher>();

export function registerFlusher(flusher: Flusher): () => void {
  flushers.add(flusher);
  return () => {
    flushers.delete(flusher);
  };
}

export async function flushPendingSaves(): Promise<void> {
  await Promise.allSettled([...flushers].map((flusher) => flusher()));
}
