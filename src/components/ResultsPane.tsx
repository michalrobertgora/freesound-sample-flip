import type { ReadonlySignal } from "@preact/signals";
import {
  formatDuration,
  formatFilesize,
  formatSampleRate,
  licenseLabel,
  previewUrl,
} from "../lib/display";
import type { FreesoundError } from "../lib/freesound";
import { ensureOnsets, onsetsFor } from "../lib/onsets";
import { playingId, position, seekTo, toggle } from "../lib/player";
import { pointerFraction, snapToOnset } from "../lib/scrub";
import type { FreesoundSound, LockedSlot } from "../lib/resolveSet";
import { store } from "../store";
import { errorMessage } from "./errorMessage";

export type SetState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ok"; slots: LockedSlot[] }
  | { status: "error"; error: FreesoundError };

/** Snap radius in rendered pixels — converted to seconds per card, so the
 * feel is constant regardless of sound length. */
const SNAP_PX = 8;

/** Above this, tick marks become noise (snapping still works). */
const MAX_ONSET_TICKS = 64;

/** The waveform PNG as a scrubber: click/drag moves the playhead there,
 * starting playback if this sound wasn't playing. The PNG maps time 1:1
 * across its width, so pointer fraction × duration is the seek target.
 * With analysis data (fetched on first hover/touch), clicks snap to the
 * nearest onset within SNAP_PX. */
function WaveScrubber({ sound, preview }: { sound: FreesoundSound; preview: string }) {
  const playing = playingId.value === sound.id;
  const frac =
    playing && sound.duration > 0
      ? Math.min(position.value / sound.duration, 1)
      : 0;
  const onsets = onsetsFor(sound.id);
  // Snap applies to the initial press only — dragging stays continuous
  // (a snapping drag would stick to onsets and fight the pointer).
  const seekAtPointer = (e: PointerEvent, snap: boolean) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const f = pointerFraction(e.clientX, rect.left, rect.width);
    const raw = f * sound.duration;
    const windowSec = rect.width > 0 ? (SNAP_PX / rect.width) * sound.duration : 0;
    const t = snap ? snapToOnset(raw, onsetsFor(sound.id), windowSec) : raw;
    seekTo(sound.id, preview, t);
  };
  return (
    <div
      class="wave-wrap"
      onPointerEnter={() => ensureOnsets(sound.id)}
      onPointerDown={(e) => {
        ensureOnsets(sound.id);
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        seekAtPointer(e, true);
      }}
      onPointerMove={(e) => {
        if ((e.currentTarget as HTMLElement).hasPointerCapture(e.pointerId))
          seekAtPointer(e, false);
      }}
    >
      <img class="waveform" src={sound.images["waveform_m"]} alt="" loading="lazy" />
      {onsets &&
        sound.duration > 0 &&
        onsets.length <= MAX_ONSET_TICKS &&
        onsets.map((t) => (
          <div
            class="wave-onset"
            key={t}
            style={{ left: `${Math.min(t / sound.duration, 1) * 100}%` }}
          />
        ))}
      {playing && (
        <>
          <div class="wave-elapsed" style={{ width: `${frac * 100}%` }} />
          <div class="wave-playhead" style={{ left: `${frac * 100}%` }} />
        </>
      )}
    </div>
  );
}

function SoundCard({ sound }: { sound: FreesoundSound }) {
  const playing = playingId.value === sound.id;
  const preview = previewUrl(sound.previews);
  return (
    <article class={playing ? "card playing" : "card"}>
      {sound.images?.["waveform_m"] &&
        (preview ? (
          <WaveScrubber sound={sound} preview={preview} />
        ) : (
          <img class="waveform" src={sound.images["waveform_m"]} alt="" loading="lazy" />
        ))}
      <div class="card-body">
        <h3 class="card-title">
          <a href={sound.url} target="_blank" rel="noreferrer">
            {sound.name}
          </a>
        </h3>
        <p class="byline small">
          <span class="muted">by {sound.username}</span>
          {/* Teaches the affordance the title link only implies: the
              full-quality original lives on the Freesound page. */}
          <a
            class="muted original-link"
            href={sound.url}
            target="_blank"
            rel="noreferrer"
            title="The full-quality original is on freesound.org (free login to download)"
          >
            original {sound.type}
            {formatFilesize(sound.filesize) ? ` · ${formatFilesize(sound.filesize)}` : ""} ↗
          </a>
        </p>
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
        <p class="muted idle-hint">
          Tune the filters, then <button onClick={onGenerate}>Generate</button>
        </p>
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
              the copied URL links to this exact selection
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
