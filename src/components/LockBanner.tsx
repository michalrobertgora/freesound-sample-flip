import { store } from "../store";

export function LockBanner() {
  const ids = store.state.value.ids;
  if (ids.length === 0) return null;
  return (
    <section class="lock-banner">
      <p class="status">
        🔒 <strong>Locked set</strong> — this link pins {ids.length} exact
        sounds; the seeded draw is bypassed and the filters are frozen. Unlock
        to edit them and draw a fresh set.
      </p>
      <button onClick={() => store.unlock()}>Unlock &amp; edit</button>
    </section>
  );
}
