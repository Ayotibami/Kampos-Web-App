"use client";

import { Modal } from "@/components/ui/Modal";

const DISMISSED_KEY = "kampos:hotExplainerDismissed";

/** Read once before ever showing the explainer — a localStorage flag, not
 * account state: this is purely "has THIS browser seen the pitch," the
 * same kind of per-device UI memory TokenRefreshTimer/etc already keep
 * outside the real data stores. Wrapped in try/catch the same way every
 * other localStorage touch in this app is — Safari private mode and a
 * full/blocked storage both throw on access, not just on write, and
 * failing open (show the explainer again) is the safe default, not a
 * crash. */
export function hotExplainerDismissed(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(DISMISSED_KEY) === "1";
  } catch {
    return false;
  }
}

export function dismissHotExplainerForever(): void {
  try {
    localStorage.setItem(DISMISSED_KEY, "1");
  } catch {
    // Best-effort — worst case it just shows again next time, never worth
    // surfacing an error for a one-time tip.
  }
}

/** The "what is As e dey hot" pitch — shown once, the first time someone
 * taps in to create a Hot post (see EDeyHotRail's own compose handlers),
 * before the real composer ever opens. Same bottom-sheet-on-mobile/
 * centered-on-desktop shell WelcomeSheet uses for its own one-time
 * milestone moment, but on the theme-aware surface/ink/muted tokens
 * (WelcomeSheet is hardcoded light on purpose — setup-profile has no dark
 * mode yet; the feed, where this lives, already does) so it reads
 * correctly in both themes with no explicit dark: overrides needed. The
 * flame reuses the exact triple-layer lick animation the rail's own "As e
 * dey hot" eyebrow already established, just scaled up — one consistent
 * "this is what fire looks like in this app" rather than a second
 * invented animation. */
export function HotExplainerModal({
  open,
  onClose,
  onDontShowAgain,
}: {
  open: boolean;
  onClose: () => void;
  onDontShowAgain: () => void;
}) {
  return (
    <Modal open={open} onClose={onClose} variant="sheet" desktopCenter>
      <div className="rounded-t-[26px] bg-surface px-6 pb-6 pt-3.5 md:rounded-[26px]">
        <div className="mx-auto mb-4 h-1 w-9 rounded-full bg-line md:hidden" />

        <div className="relative mx-auto mb-3 flex h-28 w-28 items-center justify-center">
          {/* soft blurred glow behind the flame, same trick the eyebrow
              label's own ring-of-fire border uses for atmosphere */}
          <div
            className="absolute h-20 w-20 rounded-full blur-2xl"
            style={{ backgroundColor: "var(--hot-c)", opacity: 0.45 }}
          />
          <span
            className="hot-emoji-flame relative text-[84px] leading-none"
            style={{ filter: "drop-shadow(0 0 16px rgba(255,122,26,.6))" }}
            role="img"
            aria-label="Fire"
          >
            🔥
          </span>
        </div>

        <h2 className="mb-2 text-center font-nunito text-[20px] font-black tracking-tight text-ink">
          As e dey hot
        </h2>

        {/* The Gist-vs-Hot distinction in one breath — "hot" as viral/
            trending AND literally you having a moment, with the 24h
            mechanic reframed as the fire itself cooling down (not just an
            arbitrary timer) so it reads as one consistent metaphor, not
            two separate facts bolted together. */}
        <p className="mb-6 text-center font-nunito text-[13.5px] leading-relaxed text-muted">
          As e dey hot is your hottest moments on campus — viral, trending, quick updates around you or with
          you, no time to waste. E go disappear after 24 hours, cause by then e don cool down. And if na just
          you dey hot today... make we see you!
        </p>

        <button
          type="button"
          onClick={onClose}
          style={{ backgroundImage: "linear-gradient(135deg, var(--hot-c), var(--hot-c) 75%, var(--hot-a))" }}
          className="mb-2 w-full rounded-full py-3.5 font-nunito text-sm font-extrabold text-white shadow-[0_10px_24px_-8px_rgba(255,122,26,0.45)] transition active:scale-[0.98]"
        >
          Got it, let&apos;s go
        </button>
        <button
          type="button"
          onClick={onDontShowAgain}
          className="w-full py-2 text-center font-nunito text-[12.5px] font-semibold text-faint transition active:scale-[0.98]"
        >
          Don&apos;t show me again
        </button>
      </div>
    </Modal>
  );
}
