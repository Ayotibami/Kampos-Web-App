import { useSoundStore } from "@/stores/soundStore";

/**
 * Kampos's whole UI sound-effect palette — four sounds, deliberately, not
 * one per action. See the design discussion this came out of: a distinct
 * sound for every single button starts to feel like a slot machine instead
 * of "alive." Every interactive surface in the app reuses one of these four:
 *   - tap:    generic buttons, nav, opening/closing a sheet
 *   - pop:    like/react (Gist, Spot, comments), poll vote
 *   - whoosh: create/edit/repost a Gist, post a Spot, send a comment
 *   - delete: deleting a Gist/Spot/comment — soft, deliberately not alarming
 * Report and admin-panel (villagepeople) actions stay silent on purpose —
 * see the same discussion for why.
 */
const SOUND_FILES = {
  tap: "/sounds/tap.mp3",
  pop: "/sounds/pop.mp3",
  whoosh: "/sounds/whoosh.mp3",
  delete: "/sounds/delete.mp3",
} as const;

export type SoundName = keyof typeof SOUND_FILES;

let audioContext: AudioContext | null = null;
const buffers = new Map<SoundName, AudioBuffer>();
let loaded = false;
let loadPromise: Promise<void> | null = null;

function getContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!audioContext) {
    // webkitAudioContext — Safari's own pre-standard name for this, still
    // needed for older iOS Safari/PWA builds this app has to run on.
    const Ctor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    audioContext = new Ctor();
  }
  return audioContext;
}

async function loadAll(): Promise<void> {
  const ctx = getContext();
  if (!ctx) return;
  await Promise.all(
    (Object.entries(SOUND_FILES) as [SoundName, string][]).map(async ([name, url]) => {
      if (buffers.has(name)) return;
      try {
        const res = await fetch(url);
        const arrayBuffer = await res.arrayBuffer();
        const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
        buffers.set(name, audioBuffer);
      } catch {
        // A missing/failed decode shouldn't break the tap it was meant to
        // accompany — playSound() just silently no-ops for that name.
      }
    }),
  );
  loaded = true;
}

/**
 * Kicks off preloading + decoding every sound so the FIRST tap of the
 * session already has it ready, not just later ones. Call once, early —
 * see AppShell's own mount. Safe to call repeatedly; only actually loads
 * once. Decoded once into raw AudioBuffers, not re-fetched/re-decoded on
 * every play — playSound() below just spins up a fresh, cheap
 * AudioBufferSourceNode from these each time.
 */
export function preloadSounds(): void {
  if (typeof window === "undefined") return;
  if (!loadPromise) loadPromise = loadAll();
}

/**
 * Plays a sound immediately, respecting the user's sound-effects
 * preference (Settings) — fire-and-forget, never awaited by a caller.
 * Every call creates a fresh AudioBufferSourceNode from the same decoded
 * buffer, so rapid repeat taps (mashing like, sending several comments
 * quickly) layer/overlap naturally instead of cutting each other off the
 * way re-triggering a single shared <audio> element can glitch on.
 */
export function playSound(name: SoundName): void {
  if (typeof window === "undefined") return;
  if (!useSoundStore.getState().enabled) return;

  const ctx = getContext();
  if (!ctx) return;
  // iOS/Safari start the context suspended until a real user gesture
  // resumes it — every playSound() call IS one (it only ever fires from a
  // click/tap handler), so this just makes sure playback actually starts
  // rather than silently no-op'ing on the very first tap of a session.
  if (ctx.state === "suspended") void ctx.resume();

  const buffer = buffers.get(name);
  if (!buffer) {
    // Not loaded yet (preloadSounds() still in flight, or never called on
    // this page) — kick off loading so sound still works from here on,
    // just not on this specific tap.
    if (!loaded) void loadAll();
    return;
  }
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.connect(ctx.destination);
  source.start(0);
}
