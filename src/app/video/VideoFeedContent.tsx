"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { Heart, MessageCircle, ShareIconFill, FlagIconFill, VolumeIconFill, MuteIconFill, Camera, Plus } from "@/components/ui/icons";
import { useAnyModalOpen } from "@/stores/modalStore";
import { CreateVideoSheet } from "@/components/video/CreateVideoSheet";

export interface VideoPost {
  id: string;
  /** Bare avitag, no leading "@" — the "@" is a rendering choice (dropped
   * next to the avatar, see VideoCard), not part of the stored value. */
  handle: string;
  avatarInitials: string;
  avatarColor: string;
  campusTag?: string;
  majorTag?: string;
  level?: number;
  caption: string;
  likeCount: number;
  commentCount: number;
  shareCount: number;
  reportCount: number;
  /** CSS background-image for placeholder clips with no real footage. */
  gradient?: string;
  /** A real, locally-recorded/picked clip (object URL) — only ever set for
   * something posted in this session; nothing here is uploaded anywhere
   * yet, see CreateVideoSheet's own doc. */
  src?: string;
}

// Seed content so the feed isn't empty on first load — same "unfiltered,
// global, no campus scoping" feed this tab is meant to be, just standing
// in for real posts until there's a backend to fetch from. Placeholder
// gradients (not real photos), same honesty as the design mockup this
// screen was built from — a moving clip is simulated with a slow CSS pan,
// not passed off as real footage.
const SEED_VIDEOS: VideoPost[] = [
  {
    id: "seed-1",
    handle: "tsola_reads",
    avatarInitials: "TS",
    avatarColor: "#293857",
    campusTag: "unilag",
    majorTag: "computer_science",
    level: 300,
    caption: "who set the reading room AC to arctic today 🥶",
    likeCount: 842,
    commentCount: 61,
    shareCount: 27,
    reportCount: 0,
    gradient: "radial-gradient(120% 90% at 25% 15%, #2f74e0 0%, #123a7a 45%, #0a1730 100%)",
  },
  {
    id: "seed-2",
    handle: "bimzy.codes",
    avatarInitials: "BM",
    avatarColor: "#442957",
    campusTag: "uniben",
    majorTag: "mechanical_engineering",
    level: 200,
    caption:
      "line for the buttery don loooong die 😭 — by the time you reach front dem don close am, na so we dey live",
    likeCount: 1230,
    commentCount: 84,
    shareCount: 53,
    reportCount: 1,
    gradient: "radial-gradient(115% 85% at 75% 20%, #17997a 0%, #10553f 48%, #0a1c1a 100%)",
  },
  {
    id: "seed-3",
    handle: "adaeze_unilag",
    avatarInitials: "AD",
    avatarColor: "#572940",
    campusTag: "unn",
    majorTag: "law",
    level: 400,
    caption: "guy just proposed for library o 😭😭",
    likeCount: 631,
    commentCount: 39,
    shareCount: 12,
    reportCount: 0,
    gradient: "radial-gradient(120% 90% at 60% 80%, #b3542f 0%, #7a3a1a 48%, #1f0f08 100%)",
  },
  {
    id: "seed-4",
    handle: "zainab.yaps",
    avatarInitials: "ZY",
    avatarColor: "#5a2957",
    campusTag: "ui",
    majorTag: "english_language",
    level: 200,
    caption: "lecturer said 'submit by midnight' then portal crash by 11:58 — omo the audacity 💀",
    likeCount: 2100,
    commentCount: 156,
    shareCount: 98,
    reportCount: 0,
    gradient: "radial-gradient(120% 90% at 30% 75%, #a3227a 0%, #5c1450 48%, #150a1f 100%)",
  },
  {
    id: "seed-5",
    handle: "emeka_thecruise",
    avatarInitials: "EM",
    avatarColor: "#574029",
    campusTag: "unn",
    majorTag: "mass_communication",
    level: 300,
    caption: "course rep don call meeting for the 5th time this week, una well done",
    likeCount: 412,
    commentCount: 28,
    shareCount: 9,
    reportCount: 0,
    gradient: "radial-gradient(115% 85% at 70% 25%, #b8860b 0%, #6b4d0a 48%, #1c1406 100%)",
  },
  {
    id: "seed-6",
    handle: "fatimabee",
    avatarInitials: "FB",
    avatarColor: "#295730",
    campusTag: "ui",
    majorTag: "psychology",
    level: 300,
    caption: "my roommate cooking at 1am again, e smell like better life for the whole floor",
    likeCount: 967,
    commentCount: 71,
    shareCount: 34,
    reportCount: 0,
    gradient: "radial-gradient(120% 90% at 20% 80%, #2f9e44 0%, #14551f 48%, #081f0c 100%)",
  },
  {
    id: "seed-7",
    handle: "kelvin_dbrand",
    avatarInitials: "KD",
    avatarColor: "#293857",
    campusTag: "uniben",
    majorTag: "mechanical_engineering",
    level: 200,
    caption: "workshop generator don spoil since last semester, we dey file metal by phone torchlight 🔦",
    likeCount: 1540,
    commentCount: 112,
    shareCount: 61,
    reportCount: 2,
    gradient: "radial-gradient(115% 85% at 65% 20%, #3a3fd1 0%, #1c2070 48%, #090a2b 100%)",
  },
  {
    id: "seed-8",
    handle: "dami_jollof",
    avatarInitials: "DJ",
    avatarColor: "#572929",
    campusTag: "unilag",
    majorTag: "business_administration",
    level: 400,
    caption: "final year project supervisor dey reply email like say na carrier pigeon he dey use",
    likeCount: 738,
    commentCount: 45,
    shareCount: 19,
    reportCount: 0,
    gradient: "radial-gradient(120% 90% at 50% 70%, #d1633a 0%, #7a3a1a 48%, #1f0f08 100%)",
  },
  {
    id: "seed-9",
    handle: "ifeomavibes",
    avatarInitials: "IF",
    avatarColor: "#29574b",
    campusTag: "oau",
    majorTag: "biochemistry",
    level: 300,
    caption: "practical class today na so we almost turn the whole lab to bomb scare 😭",
    likeCount: 1875,
    commentCount: 203,
    shareCount: 140,
    reportCount: 0,
    gradient: "radial-gradient(115% 85% at 40% 25%, #14a0a0 0%, #0b5757 48%, #041c1c 100%)",
  },
  {
    id: "seed-10",
    handle: "chidi_no_chill",
    avatarInitials: "CN",
    avatarColor: "#442957",
    campusTag: "oau",
    majorTag: "economics",
    level: 400,
    caption: "naira don do wetinam do for the shawarma man menu, price change three times this week",
    likeCount: 502,
    commentCount: 37,
    shareCount: 15,
    reportCount: 1,
    gradient: "radial-gradient(120% 90% at 75% 80%, #7c3aed 0%, #3f1e8a 48%, #120a2b 100%)",
  },
];

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

function VideoCard({
  video,
  active,
  muted,
  onToggleMute,
  onLike,
  liked,
  onCompose,
}: {
  video: VideoPost;
  active: boolean;
  muted: boolean;
  onToggleMute: () => void;
  onLike: () => void;
  liked: boolean;
  onCompose: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const scrubRef = useRef<HTMLDivElement>(null);
  const anyModalOpen = useAnyModalOpen();
  const [paused, setPaused] = useState(false);
  const [pop, setPop] = useState(false);
  const [captionExpanded, setCaptionExpanded] = useState(false);
  const [reported, setReported] = useState(false);
  const [progress, setProgress] = useState(0);
  const [scrubbing, setScrubbing] = useState(false);
  const tapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const shouldPlay = active && !paused && !anyModalOpen;

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

  // Real playback position for a real posted clip — only meaningful when
  // video.src is set; placeholder cards have no real timeline (see the
  // decorative loop in the scrubber render below) so this never fires for
  // them. Skipped while actively scrubbing so a drag doesn't fight with the
  // video's own timeupdate events snapping the thumb back mid-gesture.
  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    const onTimeUpdate = () => {
      if (!scrubbing && el.duration) setProgress(el.currentTime / el.duration);
    };
    el.addEventListener("timeupdate", onTimeUpdate);
    return () => el.removeEventListener("timeupdate", onTimeUpdate);
  }, [scrubbing]);

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
      if (!video.src) return; // nothing to scrub on a placeholder clip
      e.stopPropagation();
      e.currentTarget.setPointerCapture(e.pointerId);
      setScrubbing(true);
      seekFromClientX(e.clientX);
    },
    [video.src, seekFromClientX],
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

  const popHeart = useCallback(() => {
    setPop(false);
    // restart the animation even if it's already mid-pop from a rapid re-tap
    requestAnimationFrame(() => setPop(true));
  }, []);

  const handleTap = useCallback(() => {
    if (tapTimer.current) {
      // second tap within the window — treat as a double-tap, like
      clearTimeout(tapTimer.current);
      tapTimer.current = null;
      onLike();
      popHeart();
      return;
    }
    tapTimer.current = setTimeout(() => {
      tapTimer.current = null;
      setPaused((p) => !p);
    }, 260);
  }, [onLike, popHeart]);

  useEffect(() => () => {
    if (tapTimer.current) clearTimeout(tapTimer.current);
  }, []);

  return (
    <div className="relative h-full w-full shrink-0 snap-start snap-always bg-black" onClick={handleTap}>
      {video.src ? (
        <video
          ref={videoRef}
          src={video.src}
          // object-contain + a solid black bed, not object-cover — a clip
          // that isn't 9:16 (landscape, square, whatever a student's phone
          // actually recorded) letterboxes with dark bars instead of being
          // cropped, same fallback TikTok itself uses for non-portrait
          // uploads. The gradient placeholders below have no real aspect
          // ratio to preserve, so they stay object-cover-equivalent
          // (full-bleed) — this only applies to a real posted clip.
          className="absolute inset-0 h-full w-full bg-black object-contain"
          loop
          playsInline
          muted={muted}
        />
      ) : (
        <div
          className="absolute -inset-[6%] animate-[videoclip-pan_18s_ease-in-out_infinite]"
          style={{ backgroundImage: video.gradient }}
          aria-hidden
        />
      )}

      {/* Center heart-burst on double-tap-to-like — purely decorative, the
          real like state lives in the rail button below. */}
      {pop && (
        <div
          className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center"
          onAnimationEnd={() => setPop(false)}
        >
          <Heart className="h-24 w-24 animate-[heart-pop_0.55s_ease]" fill="#ff4d6d" stroke="#ff4d6d" />
        </div>
      )}

      {/* Paused affordance — a single tap toggles play/pause; this just
          confirms it happened, same idea as every other video player's
          center play glyph. */}
      {paused && (
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
          to clear the mute button just below it (top-5 = 20px), not
          overlap its own tap target. Real clips get a draggable scrubber
          (pointer-events auto, tied to the actual <video>'s currentTime);
          placeholder clips have no real timeline, so they keep the old
          decorative auto-looping bar and stay non-interactive. */}
      <div
        ref={scrubRef}
        className={`absolute inset-x-0 top-0 z-10 flex h-4 items-center px-3.5 ${
          video.src ? "" : "pointer-events-none"
        }`}
        style={video.src ? { touchAction: "none" } : undefined}
        onPointerDown={handleScrubDown}
        onPointerMove={handleScrubMove}
        onPointerUp={handleScrubUp}
        onPointerCancel={handleScrubUp}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="relative h-[2.5px] w-full rounded-full bg-white/25">
          {video.src ? (
            <div className="h-full rounded-full bg-white" style={{ width: `${Math.min(progress, 1) * 100}%` }} />
          ) : (
            active && (
              <div className="h-full w-full origin-left animate-[videoclip-progress_18s_linear_infinite] rounded-full bg-white" />
            )
          )}
          {video.src && (
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
        className="absolute right-3 top-5 z-10 flex h-7 w-7 items-center justify-center rounded-full bg-black/40 text-white"
      >
        {muted ? <MuteIconFill className="h-3.5 w-3.5" weight="fill" /> : <VolumeIconFill className="h-3.5 w-3.5" weight="fill" />}
      </button>

      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-0 h-[46%] bg-gradient-to-t from-black/85 via-black/35 to-transparent" />

      <div className="absolute bottom-[84px] left-4 right-[70px] z-10">
        <div className="flex items-center gap-1.5 font-nunito text-[13px] font-extrabold text-white">
          <span
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[9.5px] font-extrabold text-white ring-2 ring-white/80"
            style={{ backgroundColor: video.avatarColor }}
          >
            {video.avatarInitials}
          </span>
          {video.handle}
        </div>

        {(video.campusTag || video.majorTag || video.level) && (
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            {video.campusTag && <InfoTag>{video.campusTag}</InfoTag>}
            {video.majorTag && <InfoTag>{video.majorTag}</InfoTag>}
            {video.level && <InfoTag>{`${video.level}L`}</InfoTag>}
          </div>
        )}

        <p
          className={`mt-1.5 font-nunito text-[13px] font-semibold text-white/95 ${
            captionExpanded ? "" : "line-clamp-2"
          }`}
        >
          {captionExpanded || video.caption.length <= CAPTION_TRUNCATE_AT
            ? video.caption
            : video.caption.slice(0, CAPTION_TRUNCATE_AT).trimEnd()}
          {!captionExpanded && video.caption.length > CAPTION_TRUNCATE_AT && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setCaptionExpanded(true);
              }}
              aria-label="Show full caption"
              className="pl-0.5 font-extrabold text-white"
            >
              &hellip;
            </button>
          )}
        </p>
      </div>

      <div className="absolute bottom-[84px] right-2.5 z-10 flex flex-col items-center gap-4">
        {/* Own compose entry, top of the rail — the same spot Reels/TikTok
            put "your avatar with a + badge", not a separate floating button.
            Keeping it in the rail (which already clears the tab bar via its
            own bottom offset) instead of a standalone fixed FAB is what
            avoids it colliding with the Share icon just below it. */}
        <button
          type="button"
          aria-label="Record or upload a video"
          onClick={(e) => {
            e.stopPropagation();
            onCompose();
          }}
          className="relative flex h-9 w-9 items-center justify-center rounded-full bg-brand text-white ring-2 ring-white/85"
        >
          <Camera className="h-4 w-4" />
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
            popHeart();
          }}
          className="flex flex-col items-center gap-1"
        >
          <Heart className="h-6 w-6" stroke="#fff" strokeWidth={1.8} fill={liked ? "#ff4d6d" : "none"} style={{ color: liked ? "#ff4d6d" : undefined }} />
          <span className="font-nunito text-[10.5px] font-extrabold tabular-nums text-white">
            {formatCount(video.likeCount + (liked ? 1 : 0))}
          </span>
        </button>
        <button type="button" onClick={(e) => e.stopPropagation()} className="flex flex-col items-center gap-1">
          <MessageCircle className="h-6 w-6" stroke="#fff" strokeWidth={1.8} />
          <span className="font-nunito text-[10.5px] font-extrabold tabular-nums text-white">
            {formatCount(video.commentCount)}
          </span>
        </button>
        <button type="button" onClick={(e) => e.stopPropagation()} className="flex flex-col items-center gap-1">
          <ShareIconFill className="h-6 w-6" weight="fill" style={{ color: "#fff" }} />
          <span className="font-nunito text-[10.5px] font-extrabold tabular-nums text-white">
            {formatCount(video.shareCount)}
          </span>
        </button>
        <button
          type="button"
          aria-label={reported ? "Reported" : "Report"}
          onClick={(e) => {
            e.stopPropagation();
            setReported((r) => !r);
          }}
          className="flex flex-col items-center gap-1"
        >
          <FlagIconFill
            className="h-6 w-6"
            weight={reported ? "fill" : "regular"}
            style={{ color: reported ? "#ffc107" : "#fff" }}
          />
          <span className="font-nunito text-[10.5px] font-extrabold tabular-nums text-white">
            {formatCount(video.reportCount + (reported ? 1 : 0))}
          </span>
        </button>
      </div>
    </div>
  );
}

/**
 * The Video tab's feed screen — "Full Rail" direction from the UI review
 * (right-edge action rail, one clip full-bleed at a time). "Video" is a
 * placeholder name, same caveat as MobileTabBar.
 *
 * No backend yet: `videos` starts from SEED_VIDEOS and only ever grows via
 * `handlePosted` below (prepends whatever CreateVideoSheet hands back) —
 * entirely client-side, gone on refresh. Wiring this to a real feed/videos
 * endpoint is the next pass, once this direction is confirmed.
 */
export function VideoFeedContent() {
  const [videos, setVideos] = useState<VideoPost[]>(SEED_VIDEOS);
  const [activeId, setActiveId] = useState<string>(SEED_VIDEOS[0]?.id ?? "");
  const [muted, setMuted] = useState(true);
  const [likedIds, setLikedIds] = useState<Set<string>>(new Set());
  const [composeOpen, setComposeOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

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
  }, [videos]);

  const toggleLike = useCallback((id: string) => {
    setLikedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handlePosted = useCallback((post: VideoPost) => {
    setVideos((prev) => [post, ...prev]);
    setComposeOpen(false);
    // Jump the newly-posted clip into view once it's actually in the DOM.
    requestAnimationFrame(() => {
      containerRef.current?.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
      setActiveId(post.id);
    });
  }, []);

  const items = useMemo(() => videos, [videos]);

  return (
    <AppShell variant="feed">
      <div className="flex h-dvh w-full overflow-hidden bg-black">
        <div
          ref={containerRef}
          className="relative h-full w-full flex-1 snap-y snap-mandatory overflow-y-auto overscroll-y-contain"
        >
          {items.map((v) => (
            <div key={v.id} data-video-id={v.id} className="h-full w-full snap-start snap-always">
              <VideoCard
                video={v}
                active={v.id === activeId}
                muted={muted}
                onToggleMute={() => setMuted((m) => !m)}
                onLike={() => toggleLike(v.id)}
                liked={likedIds.has(v.id)}
                onCompose={() => setComposeOpen(true)}
              />
            </div>
          ))}
        </div>

        <CreateVideoSheet open={composeOpen} onClose={() => setComposeOpen(false)} onPosted={handlePosted} />
      </div>
    </AppShell>
  );
}
