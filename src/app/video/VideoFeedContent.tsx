"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { Heart, MessageCircle, ShareIconFill, FlagIconFill, VolumeIconFill, MuteIconFill, Plus } from "@/components/ui/icons";
import { useAnyModalOpen } from "@/stores/modalStore";
import { CreateVideoSheet } from "@/components/video/CreateVideoSheet";
import { SpotCommentSheet } from "@/components/video/SpotCommentSheet";
import { Avatar } from "@/components/ui/Avatar";
import { useAuthStore } from "@/stores/authStore";
import { useSpotStore, type Spot } from "@/stores/spotStore";
import { gistColorFor } from "@/lib/brand";
import { ReportModal } from "@/components/gist/ReportModal";
import { ErrorModal } from "@/components/ui/FeedbackModal";
import { env } from "@/lib/env";

function formatCount(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(n % 1000 >= 100 ? 1 : 0)}k`;
  return String(n);
}

// Roughly two lines' worth at this block's width/font-size — an
// approximation (no real layout measurement), same trade every "…more"
// truncation makes without measuring the actual rendered text.
const CAPTION_TRUNCATE_AT = 90;

function InfoTag({ children }: { children: string }) {
  return (
    <span className="rounded-full bg-white/15 px-2 py-0.5 font-nunito text-[9.5px] font-bold uppercase tracking-wide text-white/85">
      {children}
    </span>
  );
}

// How many cards on either side of the active one keep a real <video>
// mounted — active + 1 neighbor each way, 3 "hot" at once. Everything
// farther out renders just its poster image: no <video> tag at all, so no
// metadata request, no decoder, no memory held for it. This is what keeps
// a long scroll session from accumulating dozens of live video elements —
// see this screen's own windowing doc further down for the full reasoning.
const WINDOW_RADIUS = 1;

function VideoCard({
  video,
  active,
  distance,
  muted,
  myImageUrl,
  onToggleMute,
  onLike,
  onCompose,
  onOpenComments,
  onShare,
  onFlag,
}: {
  video: Spot;
  active: boolean;
  /** |this card's index - the active card's index| — how far it is from
   * the one actually playing. Only ever used to decide whether this card
   * keeps a real <video> mounted (see WINDOW_RADIUS); nothing here reads
   * it for anything else. */
  distance: number;
  muted: boolean;
  /** The VIEWER's own avatar (not this card's poster) — the compose button
   * is "your own picture with a + badge", same "add a story" language
   * Instagram/Snapchat use, not a generic camera icon. Null falls back to
   * Avatar's own plain-grey-circle degrade path. */
  myImageUrl: string | null;
  onToggleMute: () => void;
  onLike: () => void;
  onCompose: () => void;
  onOpenComments: () => void;
  onShare: () => void;
  /** Rejects on failure (spotStore.report's own contract) — this card's own
   * report modal awaits it directly to show a real error instead of
   * silently swallowing it, now that there's an actual surface to show one
   * on (there wasn't, before this modal existed). */
  onFlag: (reason: string) => Promise<void>;
}) {
  const renderVideo = distance <= WINDOW_RADIUS;
  const videoRef = useRef<HTMLVideoElement>(null);
  const scrubRef = useRef<HTMLDivElement>(null);
  const anyModalOpen = useAnyModalOpen();
  const [paused, setPaused] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [reportError, setReportError] = useState<string>();
  const [pop, setPop] = useState(false);
  const [captionExpanded, setCaptionExpanded] = useState(false);
  const [progress, setProgress] = useState(0);
  const [scrubbing, setScrubbing] = useState(false);
  // A real clip starts genuinely not-ready until its own onLoadedData
  // fires — the shimmer skeleton below covers that gap.
  const [videoReady, setVideoReady] = useState(false);
  const tapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const liked = video.my_reaction === "LIKE";
  const caption = video.caption ?? "";

  // While a real clip hasn't loaded its first frame yet, it's implicitly
  // paused — there's nothing to actually be playing or resuming, so this
  // state can't silently drift out of sync with what's genuinely on
  // screen (the shimmer skeleton, not video content).
  const shouldPlay = active && !paused && !anyModalOpen && videoReady;

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    if (shouldPlay) el.play().catch(() => {});
    else el.pause();
  }, [shouldPlay]);

  useEffect(() => {
    const el = videoRef.current;
    if (el) el.muted = muted;
  }, [muted]);

  // Real playback position — skipped while actively scrubbing so a drag
  // doesn't fight with the video's own timeupdate events snapping the thumb
  // back mid-gesture. Also re-bound on renderVideo, not just scrubbing —
  // without that, re-entering the window (a fresh <video> element, see
  // WINDOW_RADIUS) wouldn't get this listener re-attached to the NEW
  // element until scrubbing happened to change for some unrelated reason.
  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    const onTimeUpdate = () => {
      if (!scrubbing && el.duration) setProgress(el.currentTime / el.duration);
    };
    el.addEventListener("timeupdate", onTimeUpdate);
    return () => el.removeEventListener("timeupdate", onTimeUpdate);
  }, [scrubbing, renderVideo]);

  // Leaving the window resets this card's own playback session — same
  // "scroll away, scroll back, it replays from the start" behavior TikTok
  // itself has, and it's what keeps the shimmer skeleton honest: without
  // resetting videoReady, re-entering the window would briefly show the
  // OLD "ready" state for a video element that hasn't decoded a single
  // frame yet.
  useEffect(() => {
    if (!renderVideo) {
      setVideoReady(false);
      setPaused(false);
      setProgress(0);
    }
  }, [renderVideo]);

  // iOS Safari in particular can keep buffering/holding the decoder for a
  // beat after a plain DOM removal — explicitly clearing src and calling
  // load() right before this card's <video> is torn down forces it to
  // actually abort and release the resource, not just visually disappear.
  // `el` is captured here (while the element still exists) rather than
  // re-read inside the cleanup itself, which by the time it runs would see
  // videoRef.current already nulled out by React's own unmount handling.
  //
  // isFirstRun guards against a real bug this had: React 18 Strict Mode
  // (on by default in Next dev) mounts every component twice — mount,
  // simulate-unmount, mount again — specifically to catch effects that
  // don't clean up correctly. Without this guard, that SIMULATED unmount
  // right after a real mount would call this cleanup for real, stripping
  // src off a <video> that had never even started loading — confirmed
  // live: every card inside the window at first paint got its src wiped
  // before React ever got a chance to use it (readyState stuck at 0
  // forever), while cards that entered the window later via a genuine
  // scroll-triggered transition loaded fine. The teardown below is
  // destructive and non-idempotent (unlike e.g. removeEventListener), so
  // it can only ever safely run on a REAL transition, never on Strict
  // Mode's synthetic one.
  const isFirstCleanupRun = useRef(true);
  useEffect(() => {
    const el = videoRef.current;
    const wasFirstRun = isFirstCleanupRun.current;
    isFirstCleanupRun.current = false;
    if (!el) return;
    return () => {
      if (wasFirstRun) return;
      try {
        el.pause();
        el.removeAttribute("src");
        el.load();
      } catch {
        /* best-effort — nothing else to do once the element's on its way out */
      }
    };
  }, [renderVideo]);

  const seekFromClientX = useCallback((clientX: number) => {
    const bar = scrubRef.current;
    const el = videoRef.current;
    if (!bar || !el || !el.duration || Number.isNaN(el.duration)) return;
    const rect = bar.getBoundingClientRect();
    const frac = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    setProgress(frac);
    el.currentTime = frac * el.duration;
  }, []);

  const handleScrubDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      e.stopPropagation();
      e.currentTarget.setPointerCapture(e.pointerId);
      setScrubbing(true);
      seekFromClientX(e.clientX);
    },
    [seekFromClientX],
  );
  const handleScrubMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!scrubbing) return;
      e.stopPropagation();
      seekFromClientX(e.clientX);
    },
    [scrubbing, seekFromClientX],
  );
  const handleScrubUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!scrubbing) return;
    e.stopPropagation();
    setScrubbing(false);
  }, [scrubbing]);

  const handleReportSubmit = async (reason: string) => {
    setReporting(true);
    setReportError(undefined);
    try {
      await onFlag(reason);
      setShowReportModal(false);
    } catch (err) {
      setReportError(err instanceof Error ? err.message : "Failed to report this Spot");
    } finally {
      setReporting(false);
    }
  };

  const popHeart = useCallback(() => {
    setPop(false);
    // restart the animation even if it's already mid-pop from a rapid re-tap
    requestAnimationFrame(() => setPop(true));
  }, []);

  const handleTap = useCallback(() => {
    if (tapTimer.current) {
      // second tap within the window — treat as a double-tap-to-like, never
      // a double-tap-to-UNlike (see spotStore.toggleLike — this only ever
      // fires the like path visually via popHeart, but toggleLike itself
      // does flip an already-liked video back off if tapped through the
      // rail's own heart button; double-tap on the video itself is
      // deliberately like-only, matching TikTok convention).
      clearTimeout(tapTimer.current);
      tapTimer.current = null;
      if (!liked) onLike();
      popHeart();
      return;
    }
    tapTimer.current = setTimeout(() => {
      tapTimer.current = null;
      setPaused((p) => !p);
    }, 260);
  }, [liked, onLike, popHeart]);

  useEffect(() => () => {
    if (tapTimer.current) clearTimeout(tapTimer.current);
  }, []);

  const initials = video.avitag.slice(0, 2).toUpperCase();
  const avatarColor = gistColorFor(video.avitag);

  return (
    // overflow-hidden is load-bearing here, not decorative — see git
    // history: an unset overflow-x next to overflow-y:auto on the scroll
    // container computes AS auto too (CSS spec interop rule), which made
    // the whole feed horizontally scrollable and let real (never-perfectly-
    // vertical) touch gestures defeat the mandatory vertical snap.
    <div className="relative h-full w-full shrink-0 snap-start snap-always overflow-hidden bg-black" onClick={handleTap}>
      {renderVideo ? (
        <video
          ref={videoRef}
          src={video.media_url ?? undefined}
          poster={video.thumbnail_url ?? undefined}
          // object-contain + a solid black bed, not object-cover — a clip
          // that isn't 9:16 (landscape, square, whatever a student's phone
          // actually recorded) letterboxes with dark bars instead of being
          // cropped, same fallback TikTok itself uses for non-portrait
          // uploads.
          className="absolute inset-0 h-full w-full bg-black object-contain"
          loop
          playsInline
          muted={muted}
          // Only the active card actually needs the full file ready to go;
          // its one neighbor on each side (still within WINDOW_RADIUS)
          // just grabs enough to know duration/dimensions so a swipe to it
          // has a head start, not the whole download.
          preload={active ? "auto" : "metadata"}
          onLoadedData={() => setVideoReady(true)}
        />
      ) : (
        // Outside the window — no <video> element at all (see
        // WINDOW_RADIUS), just its poster sitting in the same box so
        // swiping toward it shows something immediately instead of a
        // blank frame while its real <video> mounts.
        <img
          src={video.thumbnail_url ?? undefined}
          alt=""
          className="absolute inset-0 h-full w-full bg-black object-contain"
        />
      )}

      {/* Shimmer skeleton — covers the gap between a real <video> mounting
          and its first decoded frame; fades out the instant onLoadedData
          fires above. Gated on renderVideo too, not just videoReady — a
          poster-only card has nothing loading, so it never shows this
          (videoReady never flips true for it either, but without this
          guard it'd shimmer forever, misrepresenting "not loaded yet" as
          "actively loading"). */}
      {renderVideo && !videoReady && (
        <div
          className="pointer-events-none absolute inset-0 z-10 overflow-hidden"
          style={{
            background: "radial-gradient(120% 90% at 50% 38%, #16233d 0%, #0a1120 55%, #050810 100%)",
          }}
          aria-hidden
        >
          {/* The whole rectangle breathes together, not a highlight
              sweeping across it — a brand-tinted wash over the base
              gradient, fading in and out as one shape. */}
          <div className="absolute inset-0 animate-pulse bg-brand-accent/10" />
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="relative flex h-16 w-16 items-center justify-center">
              <div className="absolute inset-0 animate-pulse rounded-full bg-brand-accent/20 blur-md" />
              <div className="relative flex h-14 w-14 animate-pulse items-center justify-center rounded-full bg-brand-accent/15 ring-1 ring-brand-accent/25">
                <svg viewBox="0 0 24 24" className="ml-0.5 h-5 w-5 fill-brand-accent/80">
                  <path d="M6 4l14 8-14 8V4z" />
                </svg>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Center heart-burst on double-tap-to-like — purely decorative, the
          real like state lives in the rail button below. */}
      {pop && (
        <div
          className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center"
          onAnimationEnd={() => setPop(false)}
        >
          <Heart className="h-24 w-24 animate-[heart-pop_0.55s_ease_forwards]" fill="#ff4d6d" stroke="#ff4d6d" />
        </div>
      )}

      {/* Paused affordance — a single tap toggles play/pause; this just
          confirms it happened. Gated on videoReady too — while the shimmer
          skeleton is showing (its own center glyph, above), this would
          otherwise stack a second play icon right on top of it. */}
      {paused && videoReady && (
        <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-black/35">
            <svg viewBox="0 0 24 24" className="ml-1 h-7 w-7 fill-white">
              <path d="M6 4l14 8-14 8V4z" />
            </svg>
          </div>
        </div>
      )}

      {/* h-4 hit-area, not just the thin visible bar — a 2.5px line is
          nearly impossible to land a finger on; kept short enough (16px)
          to clear the mute button just below it (top-5 = 20px). */}
      {/* Not interactive at all on a poster-only card (renderVideo=false)
          — there's no real <video> for seekFromClientX to act on (it
          already no-ops safely via its own `!el` guard), but skipping the
          handlers/touchAction entirely here is what stops it from eating
          a vertical swipe gesture over a card that isn't actually
          scrubbable. `progress` is already pinned at 0 for these (reset
          alongside videoReady, see its own effect), so the bar correctly
          shows empty rather than some stale position from before it left
          the window. */}
      <div
        ref={scrubRef}
        className="absolute inset-x-0 top-0 z-10 flex h-4 items-center px-3.5"
        style={renderVideo ? { touchAction: "none" } : undefined}
        onPointerDown={renderVideo ? handleScrubDown : undefined}
        onPointerMove={renderVideo ? handleScrubMove : undefined}
        onPointerUp={renderVideo ? handleScrubUp : undefined}
        onPointerCancel={renderVideo ? handleScrubUp : undefined}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="relative h-[2.5px] w-full rounded-full bg-white/25">
          <div className="h-full rounded-full bg-white" style={{ width: `${Math.min(progress, 1) * 100}%` }} />
          {renderVideo && (
            <div
              className="pointer-events-none absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white shadow-[0_0_0_3px_rgba(0,0,0,0.25)]"
              style={{ left: `${Math.min(progress, 1) * 100}%` }}
            />
          )}
        </div>
      </div>
      <button
        type="button"
        aria-label={muted ? "Unmute" : "Mute"}
        onClick={(e) => {
          e.stopPropagation();
          onToggleMute();
        }}
        className="absolute right-3 top-5 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-black/40 text-white"
      >
        {muted ? <MuteIconFill className="h-[18px] w-[18px]" weight="fill" /> : <VolumeIconFill className="h-[18px] w-[18px]" weight="fill" />}
      </button>

      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-0 h-[46%] bg-gradient-to-t from-black/85 via-black/35 to-transparent" />

      {/* bottom-[104px], not 84 — clears MobileTabBar now that it floats as
          a pill lifted off the edge instead of a flush full-width bar. */}
      <div className="absolute bottom-[104px] left-4 right-[70px] z-10">
        <div className="flex items-center gap-1.5 font-nunito text-[13px] font-extrabold text-white">
          <span
            className="flex h-6 w-6 shrink-0 items-center justify-center overflow-hidden rounded-full text-[9.5px] font-extrabold text-white ring-2 ring-white/80"
            style={{ backgroundColor: avatarColor }}
          >
            {video.image_url ? <Avatar src={video.image_url} /> : initials}
          </span>
          {video.avitag}
        </div>

        {(video.campus_tag || video.major_tag || video.level) && (
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            {video.campus_tag && <InfoTag>{video.campus_tag}</InfoTag>}
            {video.major_tag && <InfoTag>{video.major_tag}</InfoTag>}
            {video.level && <InfoTag>{`${video.level}L`}</InfoTag>}
          </div>
        )}

        {caption && (
          <p
            // The WHOLE caption is the tap target when truncated, not just
            // the "…" — a much easier, more forgiving target than a single
            // character.
            onClick={(e) => {
              if (caption.length <= CAPTION_TRUNCATE_AT || captionExpanded) return;
              e.stopPropagation();
              setCaptionExpanded(true);
            }}
            role={!captionExpanded && caption.length > CAPTION_TRUNCATE_AT ? "button" : undefined}
            aria-label={!captionExpanded && caption.length > CAPTION_TRUNCATE_AT ? "Show full caption" : undefined}
            className={`mt-1.5 font-nunito text-[13px] font-semibold text-white/95 ${
              captionExpanded ? "" : "line-clamp-2"
            } ${!captionExpanded && caption.length > CAPTION_TRUNCATE_AT ? "cursor-pointer" : ""}`}
          >
            {captionExpanded || caption.length <= CAPTION_TRUNCATE_AT ? caption : caption.slice(0, CAPTION_TRUNCATE_AT).trimEnd()}
            {!captionExpanded && caption.length > CAPTION_TRUNCATE_AT && (
              <span className="pl-0.5 font-extrabold text-white">&hellip;</span>
            )}
          </p>
        )}
      </div>

      <div className="absolute bottom-[104px] right-2.5 z-10 flex flex-col items-center gap-4">
        {/* Own compose entry, top of the rail — the viewer's OWN avatar with
            a + badge, the same "add a story" language Instagram/Snapchat
            use, not a generic camera icon. The brand ring is what keeps this
            reading as a deliberate, on-brand button no matter what a given
            person's actual photo looks like; Avatar's own fallback (a plain
            grey circle) covers anyone with no picture set. Sized a step up
            from the plain h-6 icon buttons below it — this is the one
            creation action on a rail that's otherwise all engagement. */}
        <button
          type="button"
          aria-label="Record or upload a Spot"
          onClick={(e) => {
            e.stopPropagation();
            onCompose();
          }}
          className="relative flex h-10 w-10 items-center justify-center"
        >
          {/* Clipping lives on this inner wrapper, not the button itself —
              the plus badge below is a sibling positioned to hang slightly
              past the button's own edge (-bottom-0.5 -right-0.5), which an
              overflow-hidden on the button would clip right along with the
              avatar photo it's actually meant for. */}
          <span className="h-full w-full overflow-hidden rounded-full bg-black/40 ring-2 ring-brand">
            <Avatar src={myImageUrl} />
          </span>
          <span className="absolute -bottom-0.5 -right-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-white text-brand ring-2 ring-brand">
            <Plus className="h-2 w-2" strokeWidth={3} />
          </span>
        </button>
        <button
          type="button"
          aria-label={liked ? "Unlike" : "Like"}
          onClick={(e) => {
            e.stopPropagation();
            onLike();
            if (!liked) popHeart();
          }}
          className="flex flex-col items-center gap-1"
        >
          <Heart className="h-6 w-6" stroke="#fff" strokeWidth={1.8} fill={liked ? "#ff4d6d" : "none"} style={{ color: liked ? "#ff4d6d" : undefined }} />
          <span className="font-nunito text-[10.5px] font-extrabold tabular-nums text-white">
            {formatCount(video.reactions_count)}
          </span>
        </button>
        <button
          type="button"
          aria-label="View comments"
          onClick={(e) => {
            e.stopPropagation();
            onOpenComments();
          }}
          className="flex flex-col items-center gap-1"
        >
          <MessageCircle className="h-6 w-6" stroke="#fff" strokeWidth={1.8} />
          <span className="font-nunito text-[10.5px] font-extrabold tabular-nums text-white">
            {formatCount(video.comments_count)}
          </span>
        </button>
        <button
          type="button"
          aria-label="Share"
          onClick={(e) => {
            e.stopPropagation();
            onShare();
          }}
          className="flex flex-col items-center gap-1"
        >
          <ShareIconFill className="h-6 w-6" weight="fill" style={{ color: "#fff" }} />
          <span className="font-nunito text-[10.5px] font-extrabold tabular-nums text-white">
            {formatCount(video.shares_count)}
          </span>
        </button>
        {/* No count shown here, deliberately — reports aren't a public
            metric. Opens the same reason-picker dialog Gist uses (just
            re-worded for video), not an instant one-tap report — a report
            is a deliberate, considered action. Icon fills brand-colored
            once already flagged (my_report, persisted server-side),
            disabled from then on so a second tap is a no-op instead of a
            second, wasted request. */}
        <button
          type="button"
          aria-label={video.my_report ? "Reported" : "Report"}
          disabled={video.my_report}
          onClick={(e) => {
            e.stopPropagation();
            setShowReportModal(true);
          }}
          className="flex flex-col items-center gap-1 disabled:opacity-70"
        >
          <FlagIconFill
            className="h-6 w-6"
            weight={video.my_report ? "fill" : "regular"}
            // #165abf mirrors globals.css's --color-brand — this file
            // already reaches for raw hex on every other rail icon (the
            // liked heart, the share glyph) rather than a Tailwind class,
            // since these are SVG color props, not classNames.
            style={{ color: video.my_report ? "#165abf" : "#fff" }}
          />
        </button>
      </div>

      <ReportModal
        open={showReportModal}
        onClose={() => (reporting ? undefined : setShowReportModal(false))}
        onSubmit={handleReportSubmit}
        loading={reporting}
        title="Report this Spot"
        bodyText={
          <>
            Kampos is a safe space — we work hard to keep Spot free of harmful content.
            If this Spot breaks our{" "}
            <a
              href={env.COMMUNITY_GUIDELINES_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold text-brand underline underline-offset-2"
            >
              community guidelines
            </a>
            , report it and we&apos;ll review and act on it. Rest assured, your report is 100%
            anonymous.
          </>
        }
      />
      <ErrorModal open={!!reportError} onClose={() => setReportError(undefined)} message={reportError} />
    </div>
  );
}

/**
 * The real, current visible height of the screen — NOT `100dvh`. iOS
 * Safari's address bar collapses/expands as you scroll, and `dvh` doesn't
 * always recompute reliably mid-gesture on real devices.
 * `window.visualViewport` fires reliably as the real toolbar animates, so
 * every card's height is driven from this measured pixel value instead.
 */
function useRealViewportHeight(): number | null {
  const [height, setHeight] = useState<number | null>(null);

  useEffect(() => {
    const measure = () => {
      const h = window.visualViewport?.height ?? window.innerHeight;
      setHeight(Math.round(h));
    };
    measure();
    window.visualViewport?.addEventListener("resize", measure);
    window.addEventListener("resize", measure);
    window.addEventListener("orientationchange", measure);
    return () => {
      window.visualViewport?.removeEventListener("resize", measure);
      window.removeEventListener("resize", measure);
      window.removeEventListener("orientationchange", measure);
    };
  }, []);

  return height;
}

/** Fired once via `navigator.share` where available (mobile Safari/Chrome's
 * native share sheet), falling back to a clipboard copy elsewhere (desktop
 * Chrome/Firefox have no Web Share API). Either way, `onShared` only fires
 * once the share genuinely went out/was copied — not just because the
 * button was tapped — matching the backend's own "log a share when it
 * actually completes" contract (see spot.controller.ts's `share` doc). */
async function shareSpot(spotId: string, caption: string | null, onShared: (platform: string) => void) {
  const url = `${window.location.origin}/video?spot=${spotId}`;
  if (navigator.share) {
    try {
      await navigator.share({ title: caption || "Check this out on Kampos Spot", url });
      onShared("native");
    } catch {
      // AbortError (user dismissed the sheet) or any other failure — no
      // share happened, so no /share call either.
    }
    return;
  }
  try {
    await navigator.clipboard.writeText(url);
    onShared("clipboard");
  } catch {
    /* clipboard permission denied — nothing else to fall back to here */
  }
}

export function VideoFeedContent() {
  const viewportHeight = useRealViewportHeight();
  const spots = useSpotStore((s) => s.spots);
  const loading = useSpotStore((s) => s.loading);
  const exhausted = useSpotStore((s) => s.exhausted);
  const fetchFeed = useSpotStore((s) => s.fetchFeed);
  const loadMore = useSpotStore((s) => s.loadMore);
  const toggleLike = useSpotStore((s) => s.toggleLike);
  const shareAction = useSpotStore((s) => s.share);
  const reportAction = useSpotStore((s) => s.report);
  const recordView = useSpotStore((s) => s.recordView);
  const prependSpot = useSpotStore((s) => s.prependSpot);
  // Same lookup MobileTabBar's own "You" tab avatar uses — the compose
  // button's picture is the viewer's own, not tied to any particular card.
  const myImageUrl = useAuthStore(
    (s) => (s.profiles.find((p) => p.avitag === s.avitag)?.image_url as string | undefined) ?? null,
  );

  const [activeId, setActiveId] = useState<string>("");
  const [muted, setMuted] = useState(true);
  const [composeOpen, setComposeOpen] = useState(false);
  const [commentsSpotId, setCommentsSpotId] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const lastViewedRef = useRef<string>("");

  useEffect(() => {
    void fetchFeed();
    // Only ever the initial load — loadMore (triggered by the sentinel
    // below) handles every page after this one.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!activeId && spots[0]) setActiveId(spots[0].spot_id);
  }, [spots, activeId]);

  // Which card is "active" (the one actually playing) — the same
  // threshold-based IntersectionObserver-on-each-card pattern this screen
  // has always used.
  useEffect(() => {
    const root = containerRef.current;
    if (!root) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting && entry.intersectionRatio >= 0.6) {
            const id = (entry.target as HTMLElement).dataset.videoId;
            if (id) setActiveId(id);
          }
        }
      },
      { root, threshold: [0.6] },
    );
    root.querySelectorAll("[data-video-id]").forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [spots]);

  // Infinite scroll — same sentinel-in-the-scroll-container pattern
  // FeedContent.tsx's Gist feed already uses: a nearly-invisible div near
  // the end of the loaded list, watched by its own IntersectionObserver,
  // firing loadMore() (which reads the last spot's own _feed_cursor) the
  // moment it scrolls into view. Not rendered at all once the feed is
  // exhausted, so a spent feed stops re-triggering fetches for content
  // that isn't there.
  useEffect(() => {
    const el = sentinelRef.current;
    const root = containerRef.current;
    if (!el || !root || exhausted) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) void loadMore();
      },
      { root, rootMargin: "0px 0px 200% 0px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [loadMore, exhausted, spots.length]);

  // One /view call per genuine activation — fires when a card transitions
  // INTO being the active one, not on every intersection flicker or re-
  // render while it stays active.
  useEffect(() => {
    if (!activeId || activeId === lastViewedRef.current) return;
    lastViewedRef.current = activeId;
    recordView(activeId);
  }, [activeId, recordView]);

  const handlePosted = useCallback(
    (post: Spot) => {
      prependSpot(post);
      setComposeOpen(false);
      // Jump the newly-posted clip into view once it's actually in the DOM.
      requestAnimationFrame(() => {
        containerRef.current?.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
        setActiveId(post.spot_id);
      });
    },
    [prependSpot],
  );

  const activeSpot = spots.find((s) => s.spot_id === commentsSpotId);

  // Recomputed fresh every render, never cached in state — resolving by id
  // (not a stored index) is what keeps this correct across prependSpot()
  // shifting every existing card's position by one when a new post lands
  // at the top. -1 (activeId not resolved yet, e.g. the very first paint
  // before the effect above sets it) falls back to `i` itself, which
  // treats index 0 as distance 0 — the right answer for that transient
  // frame anyway, since activeId is about to become spots[0]'s id.
  const activeIndex = spots.findIndex((s) => s.spot_id === activeId);

  return (
    <AppShell variant="feed">
      <div
        className="flex w-full overflow-hidden bg-black"
        // 100dvh only until the first real measurement lands (see
        // useRealViewportHeight's own doc).
        style={{ height: viewportHeight ? `${viewportHeight}px` : "100dvh" }}
      >
        {loading && spots.length === 0 ? (
          <div className="flex h-full w-full items-center justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/25 border-t-white" />
          </div>
        ) : spots.length === 0 ? (
          <div className="flex h-full w-full flex-col items-center justify-center gap-2 px-8 text-center">
            <span className="font-nunito text-sm font-bold text-white">No Spots yet</span>
            <span className="font-nunito text-[12.5px] text-white/60">Be the first to drop one</span>
            <button
              type="button"
              onClick={() => setComposeOpen(true)}
              className="mt-3 rounded-full bg-brand px-5 py-2.5 font-nunito text-[13px] font-extrabold text-white"
            >
              Record a Spot
            </button>
          </div>
        ) : (
          <div
            ref={containerRef}
            // overflow-x-hidden is a second, independent line of defense on
            // top of each card's own overflow-hidden.
            className="relative h-full w-full flex-1 snap-y snap-mandatory overflow-y-auto overflow-x-hidden overscroll-y-contain"
          >
            {spots.map((v, i) => (
              <div key={v.spot_id} data-video-id={v.spot_id} className="h-full w-full snap-start snap-always">
                <VideoCard
                  video={v}
                  active={v.spot_id === activeId}
                  distance={activeIndex === -1 ? i : Math.abs(i - activeIndex)}
                  muted={muted}
                  myImageUrl={myImageUrl}
                  onToggleMute={() => setMuted((m) => !m)}
                  onLike={() => void toggleLike(v.spot_id)}
                  onCompose={() => setComposeOpen(true)}
                  onOpenComments={() => setCommentsSpotId(v.spot_id)}
                  onShare={() => void shareSpot(v.spot_id, v.caption, (platform) => void shareAction(v.spot_id, platform))}
                  // reportAction() rejects on failure (see spotStore's own
                  // doc — it rolls the optimistic my_report flag back and
                  // throws). VideoCard's own report modal now awaits this
                  // directly and shows the real error via its ErrorModal
                  // (e.g. "You cannot report your own spot"), so this no
                  // longer needs to swallow it itself.
                  onFlag={(reason) => reportAction(v.spot_id, reason)}
                />
              </div>
            ))}
            {!exhausted && <div ref={sentinelRef} aria-hidden className="h-1 w-full" />}
          </div>
        )}

        <CreateVideoSheet open={composeOpen} onClose={() => setComposeOpen(false)} onPosted={handlePosted} />
        <SpotCommentSheet
          open={!!commentsSpotId}
          onClose={() => setCommentsSpotId(null)}
          spotId={commentsSpotId}
          commentCount={activeSpot?.comments_count ?? 0}
        />
      </div>
    </AppShell>
  );
}
