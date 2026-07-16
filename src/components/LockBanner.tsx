import { store } from "../store";

export function LockBanner() {
  const ids = store.state.value.ids;
  if (ids.length === 0) return null;
  return (
    <section class="lock-banner">
      <p class="status">
        🔒 <strong>Locked set</strong> — this link pins {ids.length} exact
        sounds; the seeded draw is bypassed. Changing any control (or
        unlocking) clears the lock.
      </p>
      <button onClick={() => store.unlock()}>Unlock &amp; edit</button>
    </section>
  );
}
