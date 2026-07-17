import type { ReadonlySignal } from "@preact/signals";
import {
  formatDuration,
  formatSampleRate,
  licenseLabel,
  previewUrl,
} from "../lib/display";
import type { FreesoundError } from "../lib/freesound";
import { playingId, toggle } from "../lib/player";
import type { FreesoundSound, LockedSlot } from "../lib/resolveSet";
import { store } from "../store";
import { errorMessage } from "./errorMessage";

export type SetState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ok"; slots: LockedSlot[] }
  | { status: "error"; error: FreesoundError };

function SoundCard({ sound }: { sound: FreesoundSound }) {
  const playing = playingId.value === sound.id;
  const preview = previewUrl(sound.previews);
  return (
    <article class={playing ? "card playing" : "card"}>
      {sound.images?.["waveform_m"] && (
        <img class="waveform" src={sound.images["waveform_m"]} alt="" loading="lazy" />
      )}
      <div class="card-body">
        <h3 class="card-title">
          <a href={sound.url} target="_blank" rel="noreferrer">
            {sound.name}
          </a>
        </h3>
        <p class="muted small">by {sound.username}</p>
        <p class="meta small">
          <span>{formatDuration(sound.duration)}</span>
          <span>
            {sound.type.toUpperCase()}
            {sound.samplerate ? ` · ${formatSampleRate(sound.samplerate)}` : ""}
          </span>
          <span class="badge" title={sound.license}>
            {licenseLabel(sound.license)}
          </span>
        </p>
        {sound.tags.length > 0 && (
          <p class="tags small">
            {sound.tags.slice(0, 5).map((t) => (
              <span class="tag" key={t}>
                {t}
              </span>
            ))}
          </p>
        )}
        <p class="actions">
          <button
            onClick={() => preview && toggle(sound.id, preview)}
            disabled={!preview}
          >
            {playing ? "⏸ Stop" : "▶ Play"}
          </button>
          {preview && (
            <a class="small" href={preview} target="_blank" rel="noreferrer">
              Download preview (lossy mp3)
            </a>
          )}
        </p>
      </div>
    </article>
  );
}

function MissingCard({ id }: { id: number }) {
  return (
    <article class="card missing">
      <div class="card-body">
        <h3 class="card-title">Removed from Freesound</h3>
        <p class="muted small">
          Sound #{id} was deleted after this link was made. The rest of the
          set still stands.
        </p>
      </div>
    </article>
  );
}

function SkeletonCard() {
  return (
    <article class="card skeleton" aria-hidden="true">
      <div class="waveform shimmer" />
      <div class="card-body">
        <div class="line shimmer" style={{ width: "70%" }} />
        <div class="line shimmer" style={{ width: "40%" }} />
        <div class="line shimmer" style={{ width: "85%" }} />
        <div class="line shimmer" style={{ width: "55%" }} />
      </div>
    </article>
  );
}

export function ResultsPane({
  set,
  copied,
  onGenerate,
  onCopyLink,
}: {
  set: ReadonlySignal<SetState>;
  copied: ReadonlySignal<boolean>;
  onGenerate: () => void;
  onCopyLink: (slots: LockedSlot[]) => void;
}) {
  const s = set.value;
  return (
    <main class="results">
      <h2>This week's set</h2>
      {s.status === "idle" && (
        <p class="muted">Tune the filters, hit Generate.</p>
      )}
      {s.status === "loading" && (
        <div class="sound-grid">
          {Array.from({ length: store.state.value.sampleCount }, (_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      )}
      {s.status === "error" && (
        <>
          {errorMessage(s.error)}
          <button onClick={onGenerate}>Try again</button>
        </>
      )}
      {s.status === "ok" && (
        <>
          <p class="actions">
            <button
              class={copied.value ? "copied" : ""}
              onClick={() => onCopyLink(s.slots)}
            >
              {copied.value ? "Copied!" : "Copy set link"}
            </button>
            <span class="muted small">
              pins these exact sounds — your friend opens it, no reroll
            </span>
          </p>
          <div class="sound-grid">
            {s.slots.map((slot) =>
              "missing" in slot ? (
                <MissingCard key={slot.id} id={slot.id} />
              ) : (
                <SoundCard key={slot.id} sound={slot} />
              ),
            )}
          </div>
        </>
      )}
    </main>
  );
}
