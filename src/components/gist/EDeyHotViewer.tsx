"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Modal } from "@/components/ui/Modal";
import { X, Plus, DeleteIconFill } from "@/components/ui/icons";
import { ConfirmModal } from "@/components/ui/FeedbackModal";
import { GIST_CARD_PALETTE, gistColorFor } from "@/lib/brand";

export type ViewerPost = {
  id: string;
  /** Shown as an overlay caption on a photo/video post, or as the whole
   * screen for a text-only one. */
  text: string;
  createdAt: number;
  mediaUrl?: string | null;
  mediaKind?: "photo" | "video" | null;
  /** Video only — a real Cloudinary-transformed poster frame (see
   * hot.controller.ts's `thumbnail_url` doc comment), used as the
   * `<video>`'s own `poster` so something real shows the instant the post
   * becomes current instead of a blank/black frame while the clip itself
   * streams in. Never set for a photo or text post. */
  thumbnailUrl?: string | null;
  /** The poster's own pick from GIST_CARD_PALETTE (a raw hex string, same
   * convention hot.controller.ts's GIST_CARD_PALETTE_KEYS validates against
   * — NOT a named GistColorKey like gist posts use). Only ever set for a
   * TEXT post; null for photo/video (their background is the media
   * itself) or for a post composed before this existed. */
  colorKey?: string | null;
};

export type ViewerPerson = {
  avitag: string;
  firstName: string;
  avatarGradient: string;
  posts: ViewerPost[];
  /** Same three identity tags GistCard shows under a poster's name — absent
   * (not just empty) skips that tag entirely, same convention GistCard's
   * own `gist.campus_tag`/`major_tag`/`level` checks use. */
  campusTag?: string | null;
  majorTag?: string | null;
  level?: string | number | null;
  /** Student profiles only, same as campusTag/majorTag/level — absent for
   * a KREATOR/KOMPANY/SCHOOL/IDIOT poster, by design not a bug. Shown in
   * the name-reveal intro only (the viewer's own in-post header stays
   * compact, same as before). */
  bio?: string | null;
};

const HOURS = 60 * 60 * 1000;
const DAY = 24 * HOURS;
// Fixed left/delay spread for the intro's one-shot ember burst — reuses
// globals.css's own .hot-eyebrow-ember keyframe (the same fire-burst the
// rail's "As e dey hot" label plays once per page load), just scattered
// around the avatar instead of the pill, so landing on a new person reads
// as the same lit-match moment rather than a second, unrelated effect.
const INTRO_EMBERS = [-18, -6, 8, 20, -12, 14];
// Text and photo posts both get this flat duration — a video post instead
// runs for its own real length (read from the video element once its
// metadata loads — see videoDurationMs below).
const POST_DURATION_MS = 15_000;
const INTRO_DURATION_MS = 900;
// Roughly a finger's-width of drag before it counts as a swipe rather than
// a stationary tap — same idea as SpotCommentSheet/TrimBar's own drag
// thresholds elsewhere in the app.
const SWIPE_THRESHOLD_PX = 60;
// Below this, a pointerdown is still just the start of a tap, not a hold —
// long enough that a normal tap-to-advance never accidentally pauses.
const HOLD_THRESHOLD_MS = 180;

function timeAgoLabel(createdAt: number, now: number): string {
  const diff = Math.max(0, now - createdAt);
  const h = Math.floor(diff / HOURS);
  if (h >= 1) return `${h}h`;
  const m = Math.floor(diff / (60 * 1000));
  return `${Math.max(0, m)}m`;
}

// How much longer this post has before it's gone for good — same 24h-from-
// creation math hotStore.ts's own `expiresAt` uses, recomputed here rather
// than threaded through ViewerPost (the viewer already gets `createdAt` and
// already owns a live `now`, so there's nothing a stored expiresAt would
// tell it that this doesn't). Floors at "<1m" instead of ever touching 0 —
// a post that's actually expired doesn't reach the viewer in the first
// place (EDeyHotRail prunes it client-side, same window the backend itself
// enforces), so this is purely cosmetic rounding, never a real countdown.
function expiryLabel(createdAt: number, now: number): string {
  const remaining = Math.max(0, createdAt + DAY - now);
  const h = Math.floor(remaining / HOURS);
  if (h >= 1) return `${h}h`;
  const m = Math.floor(remaining / (60 * 1000));
  return m >= 1 ? `${m}m` : "<1m";
}

// Where a person's stack should open/resume — their first not-yet-seen
// post, so reopening (or swiping back to someone you partly watched)
// continues where you left off instead of always replaying from post 0.
// If every post is already seen, starts over from the beginning — same
// convention IG/WhatsApp Stories use, rather than landing on the last one.
function resumeIndex(posts: ViewerPost[], seenPostIds: Set<string>): number {
  const idx = posts.findIndex((p) => !seenPostIds.has(p.id));
  return idx === -1 ? 0 : idx;
}

/** The "As e dey hot" viewer — Design D (Name Reveal Intro) from the
 * viewer round: landing on a new PERSON plays a brief avatar/name/time
 * moment on a dark backdrop before their content takes over full-screen,
 * same fire-colored segmented bars as the rail's own rings underneath.
 *
 * Mechanics: tap right → next post from this person · tap left → previous
 * post (or previous person's stack, once at their first post) · swipe
 * left/right → jump straight to the next/previous person's whole stack,
 * regardless of which post you were on · hold anywhere → pause the
 * current post's auto-advance.
 *
 * Renders text, photo, or video posts — see ViewerPost. */
export function EDeyHotViewer({
  open,
  people,
  initialIndex,
  now,
  seenPostIds,
  onPostViewed,
  onClose,
  onAddAnother,
  onDeletePost,
}: {
  open: boolean;
  people: ViewerPerson[];
  initialIndex: number;
  now: number;
  /** Which individual posts have already been viewed — drives both a
   * bar's empty-vs-colored state and where a person's stack resumes. */
  seenPostIds: Set<string>;
  /** Fired for every post the viewer actually lands on (as soon as it
   * becomes current, not once fully watched) — the rail uses this to mark
   * it seen. */
  onPostViewed?: (postId: string) => void;
  onClose: () => void;
  /** Only ever passed when viewing your OWN stack — renders a "+" next to
   * close so adding another post doesn't need backing out to the rail
   * first. Absent for everyone else's stack, where adding a post makes no
   * sense. */
  onAddAnother?: () => void;
  /** Only ever passed alongside onAddAnother, same "this is your own
   * stack" signal — renders a delete button at the bottom of the viewer
   * for the CURRENTLY SHOWN post specifically, not the whole stack. */
  onDeletePost?: (postId: string) => void;
}) {
  const [personIndex, setPersonIndex] = useState(initialIndex);
  const [postIndex, setPostIndex] = useState(0);
  const [introShowing, setIntroShowing] = useState(true);
  const [paused, setPaused] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  // Only meaningful while the current post is a video — its own real
  // length once the browser reports it, read via onLoadedMetadata below.
  // null until then, so the bar just waits at 0 rather than assuming
  // POST_DURATION_MS and then jarringly restarting once the real duration
  // is known.
  const [videoDurationMs, setVideoDurationMs] = useState<number | null>(null);
  // Whether the CURRENT post's own media has actually finished loading —
  // drives the blurred-thumbnail + spinner overlay below. true for a text
  // post (nothing to load), reset per post by the postKey block further
  // down, flipped by the real <img>/<video> element's own onLoad/
  // onLoadedData once the browser actually has it.
  const [mediaLoaded, setMediaLoaded] = useState(true);
  const videoRef = useRef<HTMLVideoElement>(null);

  // Fresh position every time the viewer opens (never resumes wherever a
  // previous open left off) and every time landing on a new person (always
  // starts at their first post, intro replaying) — both derived DURING
  // render by comparing against the last key seen, React's own documented
  // pattern for "reset state when a prop/value changes" without an Effect
  // (see ProfileView's identical lastSyncedUrlTab pattern elsewhere in this
  // app). A real useEffect calling setState synchronously in its body is
  // exactly what React's purity rule flags as a cascading-render risk.
  const openKey = `${open}:${initialIndex}`;
  const [lastOpenKey, setLastOpenKey] = useState(openKey);
  if (openKey !== lastOpenKey) {
    setLastOpenKey(openKey);
    if (open) {
      setPersonIndex(initialIndex);
      setPostIndex(resumeIndex(people[initialIndex]?.posts ?? [], seenPostIds));
      setIntroShowing(true);
      setPaused(false);
    }
  }
  // Resumes at the right post for whoever you land on next, but does NOT
  // replay the intro — that only plays on a fresh tap from the rail (the
  // openKey block above), never while swiping from person to person
  // inside an already-open viewer. Swiping straight into their content
  // (no re-introduction) is what makes a swipe feel like "next," not
  // "open this person again."
  const personKey = open ? `${personIndex}` : null;
  const [lastPersonKey, setLastPersonKey] = useState(personKey);
  if (personKey !== null && personKey !== lastPersonKey) {
    setLastPersonKey(personKey);
    setPostIndex(resumeIndex(people[personIndex]?.posts ?? [], seenPostIds));
  }
  // A fresh post — video or not — starts with no known duration, and with
  // its media treated as not-yet-loaded (even if it's actually already
  // cache-warm from preloadHotMedia — the real <img>/<video> onLoad below
  // flips this back to true almost instantly for anything that WAS
  // preloaded, so there's no visible spinner flash for the common case;
  // this default just covers the genuinely-still-loading case instead of
  // assuming every post is ready). A video's own onLoadedMetadata below
  // fills in the real duration; mediaLoaded is set by onLoad/onLoadedData
  // further down. Same render-time pattern as the two resets above, not an
  // effect, for the same reason. A text post is never "loading" at all —
  // starts true so no spinner ever appears over plain text.
  const postKey = `${personIndex}-${postIndex}`;
  const [lastPostKey, setLastPostKey] = useState(postKey);
  if (postKey !== lastPostKey) {
    setLastPostKey(postKey);
    setVideoDurationMs(null);
    const nextPost = people[personIndex]?.posts[postIndex];
    setMediaLoaded(!nextPost?.mediaKind);
  }

  // Reporting "seen" is a genuine side effect (an external callback, not
  // this component's own state) — a real useEffect is the right place for
  // it, unlike the resets above. Fires for every post landed on, as soon
  // as it's current — not gated on the intro clearing or the bar actually
  // finishing, same as real story apps mark a frame seen the instant it's
  // opened.
  useEffect(() => {
    if (!open) return;
    const p = people[personIndex]?.posts[postIndex];
    if (p) onPostViewed?.(p.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [personIndex, postIndex, open]);

  useEffect(() => {
    if (!open || !introShowing) return;
    const t = setTimeout(() => setIntroShowing(false), INTRO_DURATION_MS);
    return () => clearTimeout(t);
  }, [introShowing, open]);

  // No play/pause control anywhere on a video post — the SAME hold-anywhere
  // gesture that pauses a text/photo post's auto-advance bar pauses the
  // video too, since `paused` already drives both. Also holds off playing
  // during the name-reveal intro, same as the bar does.
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    if (paused || introShowing) v.pause();
    else void v.play();
  }, [paused, introShowing, personIndex, postIndex]);

  const person = people[personIndex];
  const posts = person?.posts ?? [];
  const currentPost = posts[postIndex];

  const goNextPost = () => {
    if (postIndex < posts.length - 1) setPostIndex((i) => i + 1);
    else goNextPerson();
  };
  const goPrevPost = () => {
    if (postIndex > 0) setPostIndex((i) => i - 1);
    else goPrevPerson();
  };
  const goNextPerson = () => {
    if (personIndex < people.length - 1) setPersonIndex((i) => i + 1);
    else onClose();
  };
  const goPrevPerson = () => {
    if (personIndex > 0) setPersonIndex((i) => i - 1);
  };

  // Deletes the CURRENTLY SHOWN post, not the whole stack. `posts` is
  // still the pre-delete array here, so its length minus one is what the
  // stack will actually hold once the parent's state update (triggered by
  // onDeletePost, below) lands — used to decide where to land afterward,
  // same tick, so there's no frame where postIndex points past the end of
  // a now-shorter array.
  const handleConfirmDelete = () => {
    if (!currentPost || !onDeletePost) return;
    const remaining = posts.length - 1;
    if (remaining <= 0) {
      onClose();
    } else if (postIndex >= remaining) {
      setPostIndex(remaining - 1);
    }
    onDeletePost(currentPost.id);
    setDeleteConfirmOpen(false);
  };

  const containerRef = useRef<HTMLDivElement>(null);
  const startRef = useRef<{ x: number; y: number } | null>(null);
  const holdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const heldRef = useRef(false);

  const clearHoldTimer = () => {
    if (holdTimerRef.current) {
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    startRef.current = { x: e.clientX, y: e.clientY };
    heldRef.current = false;
    holdTimerRef.current = setTimeout(() => {
      heldRef.current = true;
      setPaused(true);
    }, HOLD_THRESHOLD_MS);
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    clearHoldTimer();
    const start = startRef.current;
    startRef.current = null;
    // Releasing a hold just resumes playback — a hold is never itself a
    // navigation gesture.
    if (heldRef.current) {
      heldRef.current = false;
      setPaused(false);
      return;
    }
    if (!start) return;
    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    if (Math.abs(dx) > SWIPE_THRESHOLD_PX && Math.abs(dx) > Math.abs(dy)) {
      if (dx < 0) goNextPerson();
      else goPrevPerson();
      return;
    }
    if (introShowing) {
      setIntroShowing(false);
      return;
    }
    const rect = containerRef.current?.getBoundingClientRect();
    const relX = rect ? (e.clientX - rect.left) / rect.width : 0.5;
    if (relX < 0.33) goPrevPost();
    else goNextPost();
  };

  const handlePointerCancel = () => {
    clearHoldTimer();
    if (heldRef.current) {
      heldRef.current = false;
      setPaused(false);
    }
    startRef.current = null;
  };

  if (!person) return null;

  // The poster's own pick when they made one (hot.controller.ts already
  // validated it's a real GIST_CARD_PALETTE hex on the way in) — falling
  // back to a deterministic hash on the post's own id, never a
  // position-based cycle, so the SAME post always renders the SAME color
  // no matter where it lands in the stack.
  const bgColor = currentPost?.colorKey && (GIST_CARD_PALETTE as readonly string[]).includes(currentPost.colorKey)
    ? currentPost.colorKey
    : gistColorFor(currentPost?.id ?? "");
  const barGradient = "linear-gradient(90deg, var(--hot-c), var(--hot-b))";
  const isVideo = currentPost?.mediaKind === "video";
  const isPhoto = currentPost?.mediaKind === "photo";
  // A video's real length once known, else the flat default — and the bar
  // stays paused (see below) until that's actually settled, so it never
  // starts against a guessed duration and has to jump.
  const barDurationMs = isVideo ? (videoDurationMs ?? POST_DURATION_MS) : POST_DURATION_MS;
  // Gated on mediaLoaded too, not just the video-duration check — without
  // this a photo/video's countdown would run (and could auto-advance past
  // it) while the spinner above was still showing, before the viewer ever
  // actually displayed it.
  const barReady = mediaLoaded && (!isVideo || videoDurationMs !== null);

  return (
    <>
    <Modal open={open} onClose={onClose} variant="sheet" desktopCenter className="h-[100dvh] w-full">
      <div
        ref={containerRef}
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
        className="relative h-full w-full select-none overflow-hidden bg-black"
        // bgColor is the TEXT background, and only ever belongs behind
        // TEXT — a photo/video post used to get it too (every branch but
        // video), which meant a palette color flashed behind the media
        // while its own <img>/<video> was still loading. Photo/video now
        // just sit on plain black (bg-black above) until their own
        // content is ready, same as video already did.
        style={{ backgroundColor: isPhoto || isVideo ? undefined : bgColor }}
      >
        {/* Content, re-keyed per post so nothing carries stale state (a
            video element, scroll position, etc.) from the previous post. */}
        <div key={currentPost?.id} className="absolute inset-0">
          {isPhoto && currentPost?.mediaUrl ? (
            <>
              {/* Blurred, zoomed-in copy of the SAME photo as atmospheric
                  fill — same treatment as the composer's media canvas, so a
                  post never gets cropped (object-contain) regardless of its
                  real aspect ratio, but there's also never a plain
                  letterbox bar. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={currentPost.mediaUrl}
                alt=""
                aria-hidden
                className="absolute inset-0 h-full w-full scale-110 object-cover blur-2xl brightness-[0.55]"
              />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={currentPost.mediaUrl}
                alt=""
                className="absolute inset-0 h-full w-full object-contain"
                onLoad={() => setMediaLoaded(true)}
                // A failed load (404, offline, bad URL) still clears the
                // spinner and lets the auto-advance timer start — without
                // this, a genuinely broken image spins forever and stalls
                // auto-advance indefinitely (manual tap-to-skip still
                // works regardless, but nothing should hang open-ended).
                onError={() => setMediaLoaded(true)}
              />
            </>
          ) : isVideo && currentPost?.mediaUrl ? (
            // No blurred backdrop for video (decoding the same clip twice
            // just for atmosphere is real battery/CPU cost) — plain black
            // letterboxing instead, same call as the composer's own media
            // canvas. Muted (no mute toggle, no play/pause control at all —
            // the hold-anywhere gesture above is the only interaction),
            // autoplay driven by the effect above rather than the
            // `autoPlay` attribute, so the exact same instant it becomes
            // current is the instant it's told to play.
            // Advancing is left entirely to the bar's own onAnimationEnd
            // (below) rather than also wiring this element's `onEnded` —
            // its duration is set directly from this video's real length,
            // so the two are already synchronized; listening to both would
            // risk firing goNextPost twice for the same post if they land
            // in the same tick.
            <video
              ref={videoRef}
              src={currentPost.mediaUrl}
              // A real Cloudinary-rendered frame shows instantly instead of
              // a blank/black rectangle while the clip itself streams in —
              // the same instant win a photo's own blurred backdrop gives.
              poster={currentPost.thumbnailUrl ?? undefined}
              muted
              playsInline
              className="absolute inset-0 h-full w-full object-contain"
              onLoadedMetadata={(e) => setVideoDurationMs(Math.round(e.currentTarget.duration * 1000))}
              onLoadedData={() => setMediaLoaded(true)}
              // Same reasoning as the photo's own onError above — a video
              // that fails to load shouldn't spin forever or permanently
              // block auto-advance.
              onError={() => setMediaLoaded(true)}
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center px-9" style={{ backgroundColor: bgColor }}>
              <p className="text-center font-nunito text-[25px] font-extrabold leading-snug text-white">
                {currentPost?.text}
              </p>
            </div>
          )}

          {/* Loading spinner — over the blurred backdrop for a photo (or
              the poster frame for a video), while the real sharp media is
              still coming in. Never shows for text (mediaLoaded starts
              true for it) and clears the instant onLoad/onLoadedData
              fires above — which, for anything preloadHotMedia already
              warmed in the browser cache (see hotStore.ts), is close to
              immediate, so this is really a fallback for whatever wasn't
              preloaded in time, not the common case. */}
          {(isPhoto || isVideo) && !mediaLoaded && (
            <div className="absolute inset-0 z-[5] flex items-center justify-center">
              <div
                className="h-10 w-10 animate-spin rounded-full border-[3px] border-white/25"
                style={{ borderTopColor: "var(--hot-c)" }}
              />
            </div>
          )}

          {/* Bottom stack — a photo/video's own caption (the same frosted
              panel treatment the composer previews) above the delete
              button, when either is present, so the two never overlap
              regardless of which combination applies. */}
          {((isPhoto || isVideo) && currentPost?.text) || onDeletePost ? (
            <div
              onPointerDown={(e) => e.stopPropagation()}
              onPointerUp={(e) => e.stopPropagation()}
              className="absolute inset-x-3.5 bottom-[calc(1.25rem+env(safe-area-inset-bottom,0px))] z-10 flex flex-col items-center gap-2"
            >
              {(isPhoto || isVideo) && currentPost?.text && (
                <div className="pointer-events-none w-full rounded-2xl border border-white/20 bg-white/10 px-3.5 py-2.5 backdrop-blur-md">
                  <p className="font-nunito text-[13px] font-semibold text-white">{currentPost.text}</p>
                </div>
              )}
              {onDeletePost && currentPost && (
                <button
                  type="button"
                  onClick={() => setDeleteConfirmOpen(true)}
                  className="flex shrink-0 items-center gap-1.5 self-end rounded-full bg-black/40 px-4 py-2 font-nunito text-[12.5px] font-extrabold text-white backdrop-blur-md active:scale-95"
                >
                  <DeleteIconFill size={15} weight="fill" />
                  Delete
                </button>
              )}
            </div>
          ) : null}
        </div>

        {/* Segmented bars — one per post, same yellow→orange burn gradient
            the rail's own rings use. Only the CURRENTLY ACTIVE segment is
            ever colored/animated; every other one sits empty — including
            posts already passed this session, since a post gets marked
            seen the instant it becomes current (see the effect above), so
            "already seen" and "not currently showing" are the same set.
            That's also what makes a returning viewer's bars immediately
            show which posts are old news (empty) vs. genuinely new,
            instead of the whole row lighting up as a plain progress
            trail. */}
        <div className="absolute left-3 right-3 top-[calc(0.85rem+env(safe-area-inset-top,0px))] z-10 flex gap-1">
          {posts.map((p, i) => (
            <div key={p.id} className="h-[3px] flex-1 overflow-hidden rounded-full bg-white/30">
              {i === postIndex && (
                <div
                  key={`${personIndex}-${postIndex}-${barDurationMs}`}
                  className="h-full"
                  style={{
                    backgroundImage: barGradient,
                    animation: `hot-viewer-bar-fill ${barDurationMs}ms linear forwards`,
                    animationPlayState: barReady && !introShowing && !paused ? "running" : "paused",
                  }}
                  onAnimationEnd={goNextPost}
                />
              )}
            </div>
          ))}
        </div>

        {/* Header — its own pointer handlers stop propagation so tapping
            the avatar/name/close never also triggers the tap-to-advance
            zone underneath it. */}
        <div
          onPointerDown={(e) => e.stopPropagation()}
          onPointerUp={(e) => e.stopPropagation()}
          className="absolute left-3 right-3 top-[calc(1.6rem+env(safe-area-inset-top,0px))] z-10 flex items-center gap-2"
        >
          {/* Avatar + name/handle link out to the real profile page — same
              `/{avitag}` route GistCard's own poster links use. The inner
              Link uses `contents` display so it slots its two spans
              straight into the surrounding flex-col with no layout change
              of its own; tags stay OUTSIDE any link (tapping a campus/
              major pill isn't "visit this person," it's just context).
              Neither Link needs its own stopPropagation beyond what the
              header row above already does for the tap-to-advance zone
              underneath. */}
          <Link href={`/${person.avitag}`} onClick={onClose} className="shrink-0">
            <div
              className="h-[34px] w-[34px] rounded-full bg-cover bg-center ring-[1.5px] ring-white/60"
              style={{ backgroundImage: person.avatarGradient }}
            />
          </Link>
          <div className="flex min-w-0 flex-col gap-0.5 leading-tight">
            <Link href={`/${person.avitag}`} onClick={onClose} className="contents">
              <span className="truncate font-nunito text-[13px] font-extrabold text-white">{person.firstName}</span>
              <span className="truncate font-nunito text-[10.5px] font-semibold text-white/65">
                @{person.avitag}
              </span>
            </Link>
            {(person.campusTag || person.majorTag || person.level) && (
              <div className="mt-0.5 flex flex-wrap items-center gap-1">
                {person.campusTag && (
                  <span className="rounded-full bg-white/15 px-1.5 py-[1px] font-nunito text-[8px] font-bold uppercase tracking-wide text-white/90">
                    {person.campusTag}
                  </span>
                )}
                {person.majorTag && (
                  <span className="rounded-full bg-white/15 px-1.5 py-[1px] font-nunito text-[7.5px] font-semibold uppercase tracking-wide text-white/75">
                    {person.majorTag}
                  </span>
                )}
                {person.level && (
                  <span className="rounded-full bg-white/15 px-1.5 py-[1px] font-nunito text-[7px] font-medium uppercase tracking-wide text-white/60">
                    {person.level}
                  </span>
                )}
              </div>
            )}
          </div>
          <span className="ml-auto shrink-0 font-nunito text-[10.5px] font-semibold text-white/55">
            {currentPost ? timeAgoLabel(currentPost.createdAt, now) : ""}
          </span>
          {onAddAnother && (
            <button
              type="button"
              onClick={onAddAnother}
              aria-label="Add another post"
              className="ml-1.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-black/25 text-white"
            >
              <Plus className="h-4 w-4" strokeWidth={2.5} />
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="ml-1.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-black/25 text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Name Reveal Intro — plays once per person landed on, then
            clears itself (or a tap skips it early, same as the pause
            check above). Plain CSS keyframes, not framer-motion — see
            globals.css's own doc comment on .hot-intro-overlay for why.
            Each piece gets its own animation-delay (avatar lands first,
            then name/handle, then the info pills) so landing on someone
            new feels like a lit match catching, not everything popping in
            at once — same fire-burst language as the rail's own "As e
            dey hot" eyebrow (hot-eyebrow-ember), reused here rather than
            invented fresh. No exit animation (this is a plain conditional
            render, not AnimatePresence) — it simply clears once
            introShowing flips, same as before this pass. */}
        {introShowing && (
          <div
            aria-hidden={!introShowing}
            className="hot-intro-overlay absolute inset-0 z-20 flex flex-col items-center justify-center gap-3.5"
            style={{ backgroundImage: "linear-gradient(160deg, #2a1206, #0b0704)" }}
          >
            <div className="hot-intro-avatar relative h-[88px] w-[88px]">
              {/* The actual photo lives on its own unanimated child, never
                  the div that carries the bounce-in animation — an element
                  that's both animating its own `transform` AND painting a
                  `background-image` was observed live failing to paint
                  that image at all (confirmed two ways: identical failure
                  with framer-motion's transform animation and with this
                  plain CSS one), while a transform-animated ANCESTOR with
                  a static, un-animated image child paints every frame
                  correctly — the image still visually scales/rotates with
                  its parent either way. */}
              <div className="absolute inset-0 rounded-full bg-cover bg-center" style={{ backgroundImage: person.avatarGradient }} />
              <div
                className="hot-ring-live absolute -inset-1.5 -z-10 rounded-full"
                style={
                  {
                    backgroundImage: "conic-gradient(var(--hot-c), var(--hot-b), var(--hot-a), var(--hot-c))",
                    "--hot-spin-dur": "5s",
                    "--hot-flicker-sat": 1.3,
                    "--hot-flicker-bright": 1.15,
                  } as React.CSSProperties
                }
              />
              {INTRO_EMBERS.map((left, i) => (
                <span
                  key={i}
                  className="hot-eyebrow-ember"
                  style={{ left: `calc(50% + ${left}px)`, bottom: 0, animationDelay: `${140 + i * 40}ms` }}
                />
              ))}
            </div>
            <div className="hot-intro-name flex flex-col items-center gap-0.5">
              <span className="font-nunito text-[19px] font-extrabold text-white">{person.firstName}</span>
              <span className="font-nunito text-[12px] font-semibold text-white/55">@{person.avitag}</span>
            </div>
            {(person.campusTag || person.majorTag || person.level) && (
              <div className="hot-intro-tags flex flex-wrap items-center justify-center gap-1.5 px-10">
                {person.campusTag && (
                  <span className="rounded-full bg-white/15 px-2.5 py-1 font-nunito text-[10px] font-bold uppercase tracking-wide text-white/90">
                    {person.campusTag}
                  </span>
                )}
                {person.majorTag && (
                  <span className="rounded-full bg-white/15 px-2.5 py-1 font-nunito text-[9.5px] font-semibold uppercase tracking-wide text-white/75">
                    {person.majorTag}
                  </span>
                )}
                {person.level && (
                  <span className="rounded-full bg-white/15 px-2.5 py-1 font-nunito text-[9px] font-medium uppercase tracking-wide text-white/60">
                    {person.level}
                  </span>
                )}
              </div>
            )}
            {person.bio && (
              <p className="hot-intro-bio max-w-[280px] text-center font-nunito text-[12px] font-semibold leading-snug text-white/70">
                {person.bio}
              </p>
            )}
            <div className="hot-intro-badges flex items-center gap-1.5">
              <span className="flex items-center gap-1.5 rounded-full bg-black/30 px-3 py-1.5 font-nunito text-[11px] font-extrabold text-[var(--hot-c)]">
                🔥 posted {currentPost ? timeAgoLabel(currentPost.createdAt, now) : ""} ago
              </span>
              {/* The ephemeral premise made concrete, not just implied —
                  how much longer this specific post has, plus how many
                  are in the stack when there's more than one, so the
                  pause actually orients you for what you're about to
                  watch instead of only naming who. */}
              <span className="flex items-center gap-1 rounded-full bg-black/30 px-3 py-1.5 font-nunito text-[11px] font-extrabold text-white/70">
                ⏳ {currentPost ? expiryLabel(currentPost.createdAt, now) : ""} left
                {posts.length > 1 && ` · ${posts.length} posts`}
              </span>
            </div>
          </div>
        )}
      </div>
    </Modal>
    {onDeletePost && (
      <ConfirmModal
        open={deleteConfirmOpen}
        onClose={() => setDeleteConfirmOpen(false)}
        onConfirm={handleConfirmDelete}
        title="Delete this post?"
        message="This can't be undone — it's gone for everyone right away, not just when the 24h runs out."
        confirmLabel="Delete"
        icon={<DeleteIconFill size={26} weight="fill" />}
      />
    )}
    </>
  );
}
