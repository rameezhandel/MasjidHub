/**
 * Tiny module-level store counting API requests in flight, so the UI can show
 * a global activity indicator without every screen wiring its own state.
 * Mirrors the toast store pattern: mutate + notify subscribers.
 */
let inflight = 0;
const listeners = new Set<(active: boolean) => void>();

function notify(): void {
  for (const listener of listeners) listener(inflight > 0);
}

export const progress = {
  start(): void {
    inflight += 1;
    if (inflight === 1) notify();
  },
  done(): void {
    inflight = Math.max(0, inflight - 1);
    if (inflight === 0) notify();
  },
  subscribe(listener: (active: boolean) => void): () => void {
    listeners.add(listener);
    listener(inflight > 0);
    return () => {
      listeners.delete(listener);
    };
  },
};
