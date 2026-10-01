"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Modal } from "@/components/ui/Modal";
import { Avatar } from "@/components/ui/Avatar";
import { X, Flame, ImageIconFill, SendIconFill, PlayIconFill } from "@/components/ui/icons";
import { useAuthStore } from "@/stores/authStore";
import { GIST_CARD_PALETTE } from "@/lib/brand";
import { ALLOWED_MEDIA_TYPES, isAllowedMediaType, maxBytesFor, readVideoDurationSeconds } from "@/lib/mediaValidation";
import { fitHeroTextarea } from "@/lib/heroText";
import { useHotStore } from "@/stores/hotStore";

// Bigger than a regular gist's 700 on purpose — a Hot post can be the
// whole urgent story (what's happening, why it matters right now), not
// just a quick line, and it's gone in 24h anyway so there's less reason to
// force brevity. No backend cap exists yet — this is the frontend's own
// call until one does.
const TEXT_MAX = 1000;

// Same cap CreateVideoSheet's own Spot caption uses — past this it scrolls
// internally rather than growing indefinitely and pushing the send button
// off-screen.
const CAPTION_MAX_HEIGHT = 120;

// A Hot video can run longer than a regular gist's incidental clip
// (120s) but shorter than Spot's own cap — 3 minutes is enough for a real
// moment without turning this into a video platform.
const MAX_VIDEO_DURATION_SECONDS = 180;

// A fresh random pick each time the composer opens (see the reset effect
// below) — same spirit as FeedContent's own PROMPTS rotation for the gist
// compose trigger, so the text canvas doesn't say the exact same thing
// every single time.
const TEXT_PLACEHOLDERS = [
  "Wetin dey hot right now?",
  "Give us hot gist",
  "What's happening now now?",
  "Tell us naa as e dey hot",
  "Wetin dey sup?",
];

function pickPlaceholder(): string {
  return TEXT_PLACEHOLDERS[Math.floor(Math.random() * TEXT_PLACEHOLDERS.length)];
}

type Phase = "text" | "media";

/** The "As e dey hot" composer — a full-screen modal (Modal's own "sheet"
 * variant with its default sizing overridden to h-[100dvh], same trick
 * CreateGistSheet uses for Yarn back's full-screen takeover), not a page,
 * so it pops over the feed with Modal's existing spring animation instead
 * of a route change.
 *
 * Opens straight into `text` — a full-bleed color canvas (WYSIWYG centered
 * text, swatch-cycle background) — no separate "pick a mode" screen first.
 * The "+ photo" button switches to `media` (full-bleed photo/video with a
 * Spot-style frosted caption panel anchored to the bottom); "Aa" switches
 * back. `text` and `media` share ONE `text` state rather than two separate
 * fields — switching modes never loses what you typed, it just changes how
 * that same value renders (large centered vs. a small caption panel).
 *
 * Posts for real, straight from here — text goes through
 * useHotStore.createText, a picked photo/video through
 * useHotStore.createMedia (signature → direct-to-Cloudinary upload →
 * create, see hotStore.ts). The store's own state update is what the rail
 * actually reacts to; this component doesn't hand anything back up itself. */
export function EDeyHotComposer({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const myAvitag = useAuthStore((s) => s.avitag);
  const myImageUrl = useAuthStore(
    (s) => (s.profiles.find((p) => p.avitag === s.avitag)?.image_url as string | undefined) ?? null,
  );

  const [phase, setPhase] = useState<Phase>("text");
  const [text, setText] = useState("");
  const [colorIndex, setColorIndex] = useState(0);
  // The real File is kept alongside the blob preview now — needed at post
  // time to actually upload it (the blob URL is local-only, purely for
  // this component's own live preview, and is never what gets posted; the
  // real Cloudinary URL comes back from useHotStore.createMedia instead).
  const [media, setMedia] = useState<{ url: string; kind: "image" | "video"; file: File } | null>(null);
  const [pickError, setPickError] = useState<string | null>(null);
  const [posting, setPosting] = useState(false);
  // This component itself never unmounts between opens (only Modal's own
  // content conditionally renders) — a plain useState lazy initializer
  // would only ever pick once, on the very first mount. Re-picked as part
  // of the same reset-after-close effect below instead, so every fresh
  // open gets its own random placeholder.
  const [placeholder, setPlaceholder] = useState(() => pickPlaceholder());
  const fileRef = useRef<HTMLInputElement>(null);
  // The previous `media.url`, so the effect below can tell which blob just
  // got replaced. Tracked outside the state updater on purpose — see that
  // effect's comment. No longer needs a "but don't revoke the one just
  // posted" exemption the way this used to: a successful post hands back a
  // real Cloudinary URL from the store, a completely different string from
  // this local blob preview, so revoking the blob here never touches
  // anything the rail/viewer might still be showing.
  const prevMediaUrlRef = useRef<string | null>(null);

  // `setMedia` itself must stay a pure "here's the new value" call: React's
  // StrictMode (on in dev) double-invokes functional state updaters to
  // catch impure ones, and a revoke hidden inside one double-revokes and
  // leaves the actually-kept blob broken. So the revoke lives here instead,
  // in a plain effect reacting to `media` changing — it fires once per real
  // change regardless of StrictMode.
  useEffect(() => {
    const prevUrl = prevMediaUrlRef.current;
    if (prevUrl && prevUrl !== media?.url) {
      URL.revokeObjectURL(prevUrl);
    }
    prevMediaUrlRef.current = media?.url ?? null;
  }, [media]);

  // Reset after the close animation finishes (Modal's own spring transition
  // is ~300ms), not the instant `open` flips false — resetting immediately
  // would blank the content out from under its own exit animation.
  useEffect(() => {
    if (open) return;
    const t = setTimeout(() => {
      setPhase("text");
      setPlaceholder(pickPlaceholder());
      setText("");
      setColorIndex(0);
      setPickError(null);
      setPosting(false);
      setMedia(null);
    }, 320);
    return () => clearTimeout(t);
  }, [open]);

  const openPicker = () => fileRef.current?.click();

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    if (!isAllowedMediaType(file.type)) {
      setPickError("That file type no dey work — try a photo or video.");
      return;
    }
    if (file.size > maxBytesFor(file.type)) {
      setPickError("That file too big abeg — try a smaller one.");
      return;
    }
    const isVideo = file.type.startsWith("video/");
    if (isVideo) {
      // Checked before ever attaching it — same reasoning gists/Spot's own
      // pickers already use (reject instantly with a specific reason,
      // rather than only finding out something's wrong once posting).
      try {
        const seconds = await readVideoDurationSeconds(file);
        if (seconds > MAX_VIDEO_DURATION_SECONDS) {
          setPickError(`That video too long — keep it under ${MAX_VIDEO_DURATION_SECONDS / 60} minutes.`);
          return;
        }
      } catch {
        setPickError("Could not read that video — try a different file.");
        return;
      }
    }
    setPickError(null);
    setMedia({ url: URL.createObjectURL(file), kind: isVideo ? "video" : "image", file });
    setPhase("media");
  };

  const switchToText = () => {
    setMedia(null);
    setPhase("text");
  };

  const cycleColor = () => setColorIndex((i) => (i + 1) % GIST_CARD_PALETTE.length);

  const canPost = (text.trim().length > 0 || !!media) && !posting;

  const handlePost = async () => {
    if (!canPost) return;
    setPosting(true);
    setPickError(null);
    try {
      const trimmedText = text.trim();
      if (media) {
        await useHotStore
          .getState()
          .createMedia(media.file, media.kind === "image" ? "photo" : "video", media.file.name, trimmedText || null);
      } else {
        await useHotStore.getState().createText(trimmedText, GIST_CARD_PALETTE[colorIndex]);
      }
      onClose();
    } catch (err) {
      setPosting(false);
      setPickError(err instanceof Error ? err.message : "That didn't go through — try again.");
    }
  };

  return (
    <Modal open={open} onClose={onClose} variant="sheet" desktopCenter className="h-[100dvh] w-full">
      <div className="relative flex h-full w-full flex-col overflow-hidden bg-black">
        <input
          ref={fileRef}
          type="file"
          accept={ALLOWED_MEDIA_TYPES.join(",")}
          hidden
          onChange={(e) => {
            void handleFile(e.target.files?.[0]);
            e.target.value = "";
          }}
        />

        {phase === "text" && (
          <TextCanvas
            text={text}
            onTextChange={setText}
            colorHex={GIST_CARD_PALETTE[colorIndex]}
            onCycleColor={cycleColor}
            onClose={onClose}
            onAddPhoto={openPicker}
            avatarUrl={myImageUrl}
            avitag={myAvitag}
            onPost={handlePost}
            canPost={canPost}
            posting={posting}
            error={pickError}
            placeholder={placeholder}
          />
        )}

        {phase === "media" && media && (
          <MediaCanvas
            media={media}
            text={text}
            onTextChange={setText}
            onClose={onClose}
            onSwitchToText={switchToText}
            onChangeMedia={openPicker}
            avatarUrl={myImageUrl}
            avitag={myAvitag}
            onPost={handlePost}
            canPost={canPost}
            posting={posting}
          />
        )}
      </div>
    </Modal>
  );
}

function HotChip() {
  return (
    <div className="absolute left-1/2 top-[calc(5.25rem+env(safe-area-inset-top,0px))] z-10 flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-black/40 px-3 py-1.5 backdrop-blur-md">
      <Flame className="h-3 w-3 text-[#ffc107]" fill="currentColor" />
      <span className="font-nunito text-[10px] font-extrabold text-[#ffc107]">gone in 24h</span>
    </div>
  );
}

function CloseButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Close"
      className="flex h-9 w-9 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur-md"
    >
      <X className="h-4 w-4" />
    </button>
  );
}

function SendButton({
  onClick,
  disabled,
  sending = false,
  size = 52,
}: {
  onClick: () => void;
  disabled: boolean;
  /** Same two-stage launch-away/spinner-in treatment CommentComposer's own
   * send button uses — the icon launches off like it's just been sent, a
   * spinning ring pops in behind it to cover the wait, then shrinks back
   * out with the icon springing back in once posting resolves. */
  sending?: boolean;
  size?: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label="Make e hot"
      style={{
        width: size,
        height: size,
        // Mostly Kampos's own brand yellow, same ~90/10 weighting the ring
        // arcs use — red only right at the edge, not an even three-way
        // split.
        backgroundImage: "linear-gradient(135deg, var(--hot-c), var(--hot-c) 75%, var(--hot-a))",
      }}
      className={`flex shrink-0 items-center justify-center rounded-full text-white shadow-lg shadow-black/30 transition active:scale-95 disabled:active:scale-100 ${
        !sending && disabled ? "opacity-40" : ""
      }`}
    >
      <span className="relative flex h-1/2 w-1/2 items-center justify-center">
        <AnimatePresence initial={false}>
          {sending ? (
            <motion.span
              key="spinner"
              className="absolute inset-0 flex items-center justify-center"
              initial={{ opacity: 0, scale: 0.3, rotate: -90 }}
              animate={{ opacity: 1, scale: 1, rotate: 0 }}
              exit={{ opacity: 0, scale: 0.4 }}
              transition={{ type: "spring", stiffness: 420, damping: 24 }}
            >
              <motion.svg
                viewBox="0 0 24 24"
                className="h-full w-full"
                animate={{ rotate: 360 }}
                transition={{ repeat: Infinity, ease: "linear", duration: 0.7 }}
              >
                <circle
                  cx="12"
                  cy="12"
                  r="9"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeDasharray="34 100"
                />
              </motion.svg>
            </motion.span>
          ) : (
            <motion.span
              key="icon"
              className="absolute inset-0 flex items-center justify-center"
              initial={{ opacity: 0, scale: 0.4, x: -10, y: 10, rotate: -20 }}
              animate={{ opacity: 1, scale: 1, x: 0, y: 0, rotate: 0 }}
              exit={{ opacity: 0, scale: 0.5, x: 14, y: -14, rotate: 20 }}
              transition={{ type: "spring", stiffness: 420, damping: 22 }}
            >
              <SendIconFill className="h-full w-full" weight="fill" />
            </motion.span>
          )}
        </AnimatePresence>
      </span>
    </button>
  );
}

function WhoBit({ avatarUrl, avitag, size = 26 }: { avatarUrl: string | null; avitag: string | null; size?: number }) {
  return (
    <div className="flex items-center gap-1.5">
      <div
        style={{ width: size, height: size }}
        className="overflow-hidden rounded-full ring-[1.5px] ring-white/70"
      >
        <Avatar src={avatarUrl} />
      </div>
      <span className="font-nunito text-[11.5px] font-bold text-white">{avitag ?? "you"}</span>
    </div>
  );
}

/** Full-bleed color canvas, WYSIWYG centered text — straight out of
 * WhatsApp Status. The swatch button's own background previews the
 * current pick from the real gist palette; tap to cycle. */
function TextCanvas({
  text,
  onTextChange,
  colorHex,
  onCycleColor,
  onClose,
  onAddPhoto,
  avatarUrl,
  avitag,
  onPost,
  canPost,
  posting,
  error,
  placeholder,
}: {
  text: string;
  onTextChange: (v: string) => void;
  colorHex: string;
  onCycleColor: () => void;
  onClose: () => void;
  onAddPhoto: () => void;
  avatarUrl: string | null;
  avitag: string | null;
  onPost: () => void;
  canPost: boolean;
  posting: boolean;
  error: string | null;
  placeholder: string;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Same shrink-to-fit helper CreateGistSheet's hero mode already uses
  // (lib/heroText) — bumps the font size down as text grows, so a long
  // post still fits without needing to scroll inside the canvas, the same
  // WhatsApp Status does for its own text-only posts. One difference:
  // fitHeroTextarea also resizes the textarea's own height to hug its
  // content (right for a compact hero-card preview), but this box is
  // deliberately a full-height tap target regardless of content length —
  // so only its font-size side effect is kept; the height gets set back
  // to 100% right after.
  useLayoutEffect(() => {
    const el = textareaRef.current;
    const container = containerRef.current;
    if (!el || !container) return;
    if (text.length === 0) {
      el.style.fontSize = "";
      return;
    }
    fitHeroTextarea(el, container, 1.625);
    el.style.height = "100%";
  }, [text]);

  return (
    <div className="relative flex h-full w-full flex-col" style={{ backgroundColor: colorHex }}>
      <div className="absolute inset-x-4 top-[calc(1rem+env(safe-area-inset-top,0px))] z-10 flex items-center justify-between">
        <CloseButton onClick={onClose} />
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onAddPhoto}
            aria-label="Add a photo or video"
            className="flex h-9 w-9 items-center justify-center rounded-full bg-black/30 text-white backdrop-blur-md"
          >
            <ImageIconFill className="h-4 w-4" weight="fill" />
          </button>
          <button
            type="button"
            onClick={onCycleColor}
            aria-label="Change background color"
            // The full palette as a wheel, not just the current pick — the
            // button always shows every color it can cycle to (like a
            // pizza), rather than looking like a plain flat swatch that
            // happens to change.
            style={{ backgroundImage: `conic-gradient(${GIST_CARD_PALETTE.join(", ")})` }}
            className="h-9 w-9 rounded-full border-2 border-white shadow-sm shadow-black/30 transition active:scale-90"
          />
        </div>
      </div>

      {error && (
        <p className="absolute inset-x-10 top-[calc(4.25rem+env(safe-area-inset-top,0px))] z-10 rounded-full bg-danger px-3.5 py-2 text-center font-nunito text-[11px] font-bold text-white">
          {error}
        </p>
      )}

      <HotChip />

      {/* The box itself spans almost the full height between the top icon
          row and the bottom who/send bar. The bottom bar is a real flex
          sibling, so flex-1 naturally stops above it — but the top icons
          and HotChip are absolutely positioned OVER the content (needed in
          MediaCanvas, where they float over a full-bleed photo), so
          nothing here reserves their space automatically. pt- below
          manually clears that same zone (icon row + HotChip + a little
          breathing room) so typed text can never render underneath them.
          `content-center` vertically centers whatever's typed inside the
          box (short text sits centered, like the mockup; long text just
          fills naturally from the top). */}
      <div ref={containerRef} className="min-h-0 flex-1 px-8 pb-2 pt-[calc(8rem+env(safe-area-inset-top,0px))]">
        <textarea
          ref={textareaRef}
          autoFocus
          value={text}
          onChange={(e) => onTextChange(e.target.value.slice(0, TEXT_MAX))}
          placeholder={placeholder}
          className="h-full w-full resize-none content-center bg-transparent text-center font-nunito text-[26px] font-extrabold leading-snug text-white placeholder:text-white/55 focus:outline-none"
        />
      </div>

      <div className="flex items-center justify-between gap-3 px-4 pb-[calc(1.25rem+env(safe-area-inset-bottom,0px))]">
        <WhoBit avatarUrl={avatarUrl} avitag={avitag} />
        <SendButton onClick={onPost} disabled={!canPost} sending={posting} />
      </div>
    </div>
  );
}

/** Full-bleed photo/video, a Spot-style frosted glass caption panel
 * anchored to the bottom edge instead of text floating loose on the
 * pixels — the exact pattern CreateVideoSheet already ships. */
function MediaCanvas({
  media,
  text,
  onTextChange,
  onClose,
  onSwitchToText,
  onChangeMedia,
  avatarUrl,
  avitag,
  onPost,
  canPost,
  posting,
}: {
  media: { url: string; kind: "image" | "video" };
  text: string;
  onTextChange: (v: string) => void;
  onClose: () => void;
  onSwitchToText: () => void;
  /** Reopens the native picker in place — no need to back out to text mode
   * and re-attach just to pick a different photo/video. */
  onChangeMedia: () => void;
  avatarUrl: string | null;
  avitag: string | null;
  onPost: () => void;
  canPost: boolean;
  posting: boolean;
}) {
  const captionRef = useRef<HTMLTextAreaElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  // Starts true (play button showing) rather than guessing — the effect
  // below corrects it the instant the browser actually decides whether
  // autoplay-with-sound is allowed.
  const [videoPaused, setVideoPaused] = useState(true);

  // Grows the caption to fit its content, up to CAPTION_MAX_HEIGHT — past
  // that it scrolls internally instead of pushing the who/send row further
  // down. Same approach CreateVideoSheet's own Spot caption already uses.
  useLayoutEffect(() => {
    const el = captionRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, CAPTION_MAX_HEIGHT)}px`;
  }, [text]);

  // Not muted, so most browsers' autoplay-with-sound policy will actually
  // block this (it only allows unmuted autoplay after real user "media
  // engagement," which a freshly-picked file never has yet) — calling
  // play() manually and reading the returned promise is the only reliable
  // way to know whether it actually started, since the `autoplay` HTML
  // attribute alone fails silently with no event to catch. A rejection
  // just means the play button shows and the very next tap (a real user
  // gesture) always succeeds.
  useEffect(() => {
    if (media.kind !== "video") return;
    const v = videoRef.current;
    if (!v) return;
    const playPromise = v.play();
    if (playPromise !== undefined) {
      playPromise.then(() => setVideoPaused(false)).catch(() => setVideoPaused(true));
    }
  }, [media.kind, media.url]);

  const toggleVideoPlayback = () => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) void v.play();
    else v.pause();
  };

  return (
    <div className="relative h-full w-full bg-black">
      {media.kind === "image" ? (
        <>
          {/* Blurred, zoomed-in copy of the SAME photo as atmospheric fill —
              never the real content, purely decorative backdrop so there's
              no plain letterbox bar. Uploads here can be any aspect ratio
              (no live camera locking it to one shape), so the real photo
              below is object-contain, not object-cover — cover would crop
              an arbitrary upload and could cut off the actual subject. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={media.url} alt="" aria-hidden className="absolute inset-0 h-full w-full scale-110 object-cover blur-2xl brightness-[0.55]" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={media.url} alt="" className="absolute inset-0 h-full w-full object-contain" />
        </>
      ) : (
        <>
          {/* Not muted — a picked video's own sound plays, same as it will
              once posted. No blurred backdrop layer (unlike the photo
              case): decoding the same clip twice just for atmosphere is
              real CPU/battery cost on a phone, and plain black letterboxing
              already reads as normal for video. `onPlay`/`onPause` mirror
              the video's own real state rather than a hand-toggled guess,
              so this stays correct even if playback stops for a reason
              other than the tap (e.g. it finished loading paused). */}
          <video
            ref={videoRef}
            src={media.url}
            className="absolute inset-0 h-full w-full object-contain"
            loop
            playsInline
            onClick={toggleVideoPlayback}
            onPlay={() => setVideoPaused(false)}
            onPause={() => setVideoPaused(true)}
          />
          {videoPaused && (
            <button
              type="button"
              onClick={toggleVideoPlayback}
              aria-label="Play"
              className="absolute left-1/2 top-1/2 z-[5] flex h-14 w-14 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur-sm"
            >
              <PlayIconFill className="ml-0.5 h-6 w-6" weight="fill" />
            </button>
          )}
        </>
      )}
      {/* Bottom scrim only — matching the concluded mockup exactly. No top
          scrim: the close/switch buttons already carry their own solid
          bg-black/40 circles for contrast, so a gradient up there would
          just be redundant chrome the design never called for. */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-56 bg-gradient-to-t from-black/60 to-transparent" />

      <div className="absolute inset-x-4 top-[calc(1rem+env(safe-area-inset-top,0px))] z-10 flex items-center justify-between">
        <CloseButton onClick={onClose} />
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onChangeMedia}
            aria-label="Change photo or video"
            className="flex h-9 w-9 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur-md"
          >
            {/* Same icon TextCanvas's "+ photo" button uses — reusing it
                here (rather than a generic refresh/swap glyph) keeps one
                consistent meaning app-wide: this icon = "pick media,"
                whether that's attaching the first one or swapping it. */}
            <ImageIconFill className="h-4 w-4" weight="fill" />
          </button>
          <button
            type="button"
            onClick={onSwitchToText}
            aria-label="Switch to text"
            className="flex h-9 w-9 items-center justify-center rounded-full bg-black/40 font-nunito text-[11px] font-black text-white backdrop-blur-md"
          >
            Aa
          </button>
        </div>
      </div>

      <HotChip />

      <div className="absolute inset-x-3.5 bottom-[calc(1.25rem+env(safe-area-inset-bottom,0px))] z-10 flex flex-col gap-2.5">
        <div className="rounded-2xl border border-white/20 bg-white/10 px-3.5 py-2.5 backdrop-blur-md">
          <textarea
            ref={captionRef}
            value={text}
            onChange={(e) => onTextChange(e.target.value.slice(0, TEXT_MAX))}
            placeholder="Add a caption… (optional)"
            rows={1}
            style={{ maxHeight: CAPTION_MAX_HEIGHT }}
            className="w-full resize-none overflow-y-auto bg-transparent font-nunito text-[13px] font-semibold text-white placeholder:text-white/55 focus:outline-none"
          />
        </div>
        <div className="flex items-center justify-between">
          <WhoBit avatarUrl={avatarUrl} avitag={avitag} />
          <SendButton onClick={onPost} disabled={!canPost} sending={posting} size={48} />
        </div>
      </div>
    </div>
  );
}
