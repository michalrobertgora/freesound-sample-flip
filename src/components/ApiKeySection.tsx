import { apiKey, saveApiKey } from "../lib/apiKey";
import { APPLY_URL } from "../lib/freesound";

export function ApiKeySection() {
  return (
    <section>
      <h2>Freesound API key</h2>
      <input
        type="password"
        class="key-input"
        value={apiKey.value}
        placeholder="Paste your API key"
        autocomplete="off"
        onInput={(e) => saveApiKey((e.target as HTMLInputElement).value)}
      />
      <p class="muted small">
        Stored only in this browser — never in shared links.{" "}
        <a href={APPLY_URL} target="_blank" rel="noreferrer">
          Get a key from Freesound
        </a>
      </p>
    </section>
  );
}
