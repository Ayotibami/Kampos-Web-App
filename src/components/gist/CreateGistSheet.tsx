"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Avatar } from "@/components/ui/Avatar";
import { MediaImage, MediaVideo } from "@/components/ui/MediaFrame";
import { ErrorModal, AnonymousModeModal } from "@/components/ui/FeedbackModal";
import { CameraIconFill, ImageIconFill, PaletteIconFill, PollIconFill, AnonymousIconFill, X, Video, Sticker, Plus as PlusIcon } from "@/components/ui/icons";
import {
  useGistStore,
  MediaUploadError,
  buildOfflineGist,
  buildOfflineGistMedia,
  notifyActionSucceeded,
  notifyActionFailed,
} from "@/stores/gistStore";
import { useAuthStore } from "@/stores/authStore";
import { apiErrorMessage } from "@/lib/api";
import { LIMITS, GIST_CARD_PALETTE, GIST_COLOR_KEYS, type GistColorKey } from "@/lib/brand";
import { fitHeroTextarea } from "@/lib/heroText";
import { stripInvisibleChars, sanitizeForSubmit, sanitizeFileName } from "@/lib/sanitize";
import { playSound } from "@/lib/sounds";
import { QuotedGistPreview } from "./GistCard";
import {
  ALLOWED_MEDIA_TYPES,
  maxBytesFor,
  isAllowedMediaType,
  isGenuineMedia,
  MAX_VIDEO_DURATION_SECONDS,
  readVideoDurationSeconds,
} from "@/lib/mediaValidation";
import type { Gist } from "@/types";

// Both are only ever mounted while their own trigger state is true
// (`{showCamera && <WebcamCapture .../>}`, `<GiphyPicker open={showGifPicker}
// .../>` — see their call sites below), so unlike the controlled dialogs
// this component's own callers dynamic()-wrap, these two genuinely defer
// their chunk fetch until someone actually taps the camera/GIF button, not
// just until the compose sheet opens. No refs on either, both take plain
// callback props, so there's nothing for next/dynamic's ref-forwarding gap
// to break.
const WebcamCapture = dynamic(() => import("./WebcamCapture").then((m) => m.WebcamCapture), {
  ssr: false,
});
const GiphyPicker = dynamic(() => import("./GiphyPicker").then((m) => m.GiphyPicker), {
  ssr: false,
});

interface PickedMedia {
  id: string;
  url: string;
  /** Absent for a GIF/sticker picked from GIPHY — those are already hosted
   * on GIPHY's CDN, so `url` itself is what gets attached (no blob upload,
   * see remoteUrl below). */
  blob?: Blob;
  /** Set (equal to `url`) for a GIPHY pick — the signal handlePost uses to
   * call attachMediaUrl instead of uploadMedia. */
  remoteUrl?: string;
  /** GIPHY's own reported dimensions for a remote pick — null/absent for
   * everything else (a blob's real size only becomes known once Cloudinary
   * finishes processing it at upload time, see uploadMedia). */
  width?: number | null;
  height?: number | null;
  kind: "image" | "video";
  name: string;
  /** Set when this entry is media the gist already had (editing an existing
   * post) — its real media_id, needed to call removeMedia if the user
   * deletes it here. Absent for anything newly picked in this session,
   * which is exactly what distinguishes "needs uploading on save" from
   * "already on the server, only deletion is a real action." */
  existingId?: string;
}

// Thresholds scale with whatever cap is actually in effect (20%/10% of it
// remaining) — the normal LIMITS.gist for a text/media gist, or the
// shorter LIMITS.pollGistTextMax once a poll is attached (see showPoll) —
// so they stay proportionally meaningful either way. Punchier, more
// saturated than the app's semantic success/warning/danger tokens (those
// are tuned for subtle badges/borders, not a small filled ring that needs
// to actually read as a color at a glance).
function countColor(remaining: number, max: number): string {
  if (remaining > max * 0.2) return "#22c55e";
  if (remaining > max * 0.1) return "#f59e0b";
  return "#ef4444";
}

/** Twitter/X-style char-count ring: an empty track that fills clockwise as
 * the limit approaches, swapping in the remaining number only once it's
 * actually worth drawing attention to (close to/over the limit) — otherwise
 * the ring alone is the whole signal, same as it works everywhere else. */
function CharCountRing({ length, max }: { length: number; max: number }) {
  const remaining = max - length;
  // Sized to give a 3-digit number (a poll's shorter cap can now go
  // negative into the low hundreds — see the poll-toggle handler below,
  // which deliberately stops trimming existing text) real room inside the
  // ring instead of butting up against the stroke — the original 26px ring
  // was sized for 1-2 digits only.
  const size = 30;
  const stroke = 2.5;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = Math.min(length / max, 1);
  const color = countColor(remaining, max);
  const showNumber = remaining <= max * 0.1;

  return (
    <div className="relative flex h-8 w-8 shrink-0 items-center justify-center">
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={stroke}
          className="text-black/10 dark:text-white/15"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - progress)}
          style={{ transition: "stroke-dashoffset 0.15s ease, stroke 0.15s ease" }}
        />
      </svg>
      {showNumber && (
        <span
          className="absolute font-nunito text-[10px] font-semibold tabular-nums"
          style={{ color }}
        >
          {remaining}
        </span>
      )}
    </div>
  );
}

const DEFAULT_PLACEHOLDER = "Wetin dey your mind? Gist us na 😌";
// "What's on your mind" doesn't fit when reacting to something specific
// someone else already posted — this is the static (no typing-animation)
// fallback for a Yarn back instead, same reasoning DEFAULT_PLACEHOLDER's
// own fallback branch already has.
const YARN_BACK_PLACEHOLDER = "Yarn your own take on this...";
// Matches the old trigger-button typing speed (PROMPT_TYPE_SPEED_MS) from
// before that animation lived in FeedContent.
const PLACEHOLDER_TYPE_SPEED_MS = 50;

/** Brand-color circular progress ring for a mid-upload media thumbnail —
 * same construction as CharCountRing above, swapped to a fixed brand blue
 * since upload progress has no "getting risky" states to color-code. */
function UploadProgressRing({ percent }: { percent: number }) {
  const size = 32;
  const stroke = 2.5;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = Math.min(Math.max(percent, 0) / 100, 1);

  return (
    <div className="relative flex h-8 w-8 shrink-0 items-center justify-center">
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={stroke}
          className="text-white/25"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - progress)}
          className="text-brand-accent"
          style={{ transition: "stroke-dashoffset 0.15s ease" }}
        />
      </svg>
    </div>
  );
}

export function CreateGistSheet({
  open,
  onClose,
  onPosted,
  onPostSynced,
  onPostFailed,
  initialText,
  placeholder,
  editGist,
  quoteGist,
}: {
  open: boolean;
  onClose: () => void;
  /** Fires with the fresh, fully-joined gist (real media/counts/reactions,
   * not just the bare row create/update return on their own) once posting
   * or saving actually finishes — lets the caller splice it into whatever
   * list it's already showing instead of blindly refetching the entire
   * feed, which used to throw away scroll position and any pages loaded
   * past the first. `mode` distinguishes a brand-new post (append
   * somewhere) from an edit (replace the existing entry in place).
   *
   * For a brand-new post specifically (not editing), this now fires
   * TWICE: once immediately with a locally-built optimistic placeholder
   * (gist_id prefixed "posting-") the instant Post is tapped — the sheet
   * closes right away rather than blocking on the network — and again
   * later via onPostSynced/onPostFailed once the real request actually
   * resolves. Callers that only implement onPosted and not those two
   * still work, they just never learn the optimistic placeholder needs
   * replacing or removing — see onPostSynced/onPostFailed below. */
  onPosted?: (gist: Gist, mode: "created" | "edited") => void;
  /** The optimistic placeholder onPosted was just called with has now been
   * confirmed for real — swap it (by `tempId`, the placeholder's own
   * gist_id) for `realGist` in whatever list holds it. Create-only; never
   * fires for editGist, which still uses the older wait-then-onPosted
   * path (see handlePost's own doc for why edits weren't included). */
  onPostSynced?: (tempId: string, realGist: Gist) => void;
  /** The optimistic placeholder failed to actually post — remove it from
   * wherever onPosted inserted it. The sheet has already reopened itself
   * with the draft fully intact by the time this fires (see handlePost),
   * so there's nothing else the caller needs to do beyond removing the
   * now-dead placeholder. */
  onPostFailed?: (tempId: string) => void;
  initialText?: string;
  /** Whatever the compose trigger's rotating prompt was showing at the
   * moment it got clicked — falls back to a static default when opened some
   * other way (e.g. quoting a gist) where there's no trigger prompt to match. */
  placeholder?: string;
  /** Editing an existing gist instead of composing a new one — pre-fills
   * the text and media, and swaps the submit action to update-in-place. */
  editGist?: Gist;
  /** Yarn back — quoting an existing gist. Embeds a compact read-only
   * preview of it below the textarea and rides its id along as
   * `quoted_gist_id` in the create payload. Never anonymous (see the
   * avatar block below), and never a hero-color/poll pick either — those
   * are for a gist standing on its own, not one that's already carrying
   * someone else's inside it. */
  quoteGist?: Gist;
}) {
  const { create, update, uploadMedia, attachMediaUrl, removeMedia: removeMediaApi, remove: removeGistApi, get: getGist } = useGistStore();
  const myImageUrl = useAuthStore(
    (s) => (s.profiles.find((p) => p.avitag === s.avitag)?.image_url as string | undefined) ?? null
  );
  const myAvitag = useAuthStore((s) => s.avitag);
  const fileRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const heroBoxRef = useRef<HTMLDivElement>(null);
  const isEditing = !!editGist;

  const [text, setText] = useState("");
  // Poster's own pick for the short-text hero color — null means "no pick,
  // fall back to the hash-based color" same as before this existed. Only
  // ever meaningful while colorPickerEligible (see below) is true; kept
  // around (not cleared) if they type past the threshold and back below it,
  // so a pick isn't thrown away just because they were mid-typing.
  const [pickedColor, setPickedColor] = useState<GistColorKey | null>(null);
  const [showColorPicker, setShowColorPicker] = useState(false);

  // Types out the compose trigger's snapshotted prompt (see the `placeholder`
  // prop doc above) into the textarea's own placeholder, once, each time the
  // sheet opens — the "notice me" typing effect that used to run continuously
  // in the background on the trigger button itself now happens here instead,
  // aimed at whichever single prompt got picked at click time. Editing (no
  // `placeholder` passed) just shows the static default, no animation —
  // there's no freshly-picked prompt behind it to justify one. Yarn back
  // gets its own static default instead of that one, for the same "no
  // animation to justify" reason — see YARN_BACK_PLACEHOLDER's own doc.
  const [typedPlaceholder, setTypedPlaceholder] = useState("");
  useEffect(() => {
    if (!open) return;
    if (!placeholder) {
      setTypedPlaceholder(quoteGist ? YARN_BACK_PLACEHOLDER : DEFAULT_PLACEHOLDER);
      return;
    }
    setTypedPlaceholder("");
    let cancelled = false;
    let i = 0;
    const tick = () => {
      if (cancelled) return;
      i++;
      setTypedPlaceholder(placeholder.slice(0, i));
      if (i < placeholder.length) timer = window.setTimeout(tick, PLACEHOLDER_TYPE_SPEED_MS);
    };
    let timer = window.setTimeout(tick, PLACEHOLDER_TYPE_SPEED_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [open, placeholder, quoteGist]);

  // Custom scroll-position indicator for the textarea, replacing the native
  // scrollbar (hidden via no-scrollbar) with something that matches the
  // app's own look. null while there's nothing to scroll.
  const [scrollThumb, setScrollThumb] = useState<{ top: number; height: number } | null>(null);
  const updateScrollThumb = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    if (el.scrollHeight <= el.clientHeight + 1) {
      setScrollThumb(null);
      return;
    }
    const heightFrac = el.clientHeight / el.scrollHeight;
    const topFrac = el.scrollTop / el.scrollHeight;
    setScrollThumb({ top: topFrac * 100, height: heightFrac * 100 });
  }, []);
  useEffect(() => {
    updateScrollThumb();
  }, [text, updateScrollThumb]);

  const [media, setMedia] = useState<PickedMedia[]>([]);
  // Poll mode — mutually exclusive with media (see handlePost) and with the
  // colored hero background (see colorPickerEligible below): a poll always
  // renders as plain text above its options, never the big centered
  // graphic. Two empty slots to start, same as X's own composer; up to
  // LIMITS.pollMaxOptions. Creation-only, same reasoning color_key already
  // has — there's no edit-a-poll-after-posting flow, so the toggle itself
  // is hidden entirely while isEditing (see the button below).
  const [showPoll, setShowPoll] = useState(false);
  const [pollOptions, setPollOptions] = useState<string[]>(["", ""]);
  // Anonymous-post toggle — is_anonymous rides along in the create payload
  // (see handlePost below) and the backend stores/redacts it (gist.repo.ts
  // swaps avitag for everyone but the poster). Badge lives on the avatar
  // itself (see the avatar block below) rather than a separate action-row
  // icon — same "concept A" reasoning discussed for this: a persistent,
  // always-visible affordance beats one that only teaches itself once via
  // a first-use animation.
  const [isAnonymous, setIsAnonymous] = useState(false);
  // Shown every time the badge switches isAnonymous ON (never on OFF) —
  // see AnonymousModeModal's own doc for why this isn't a one-time thing.
  const [showAnonModal, setShowAnonModal] = useState(false);
  // Same rendering rule GistCard uses to decide "colored hero card vs plain
  // text + media" (SHORT_TEXT there) — a color pick only ever matters while
  // this is true, since otherwise the plain layout never shows it at all.
  // Also creation-only for now: `update()` doesn't send color_key through to
  // the backend's PATCH route, so offering the picker mid-edit would look
  // like it works and then silently not save. showPoll excluded too — a
  // poll gist never gets the colored treatment, see this component's own
  // doc on showPoll above. quoteGist is allowed through now — a Yarn back
  // can carry a colored frame around its nested quote (see the posted
  // card's own RepostHero), same length/media constraints as any other
  // color pick.
  const colorPickerEligible = !isEditing && !showPoll && text.length < 200 && media.length === 0;
  // Live WYSIWYG preview only kicks in once an actual pick has been made —
  // before that there's no way to know what the eventual gist_id-hash-based
  // fallback color would be (it doesn't exist yet), so showing some
  // arbitrary placeholder color would be a preview of nothing real. Applies
  // the same way whether or not this is a Yarn back — it's MY text getting
  // colored, same picker, same rules; the quoted gist below (if any) is
  // rendered on its own, completely unaffected by this (see quoteGist's own
  // doc above). Only the full-takeover layout bits (avatar hidden, box
  // filling the whole row) are quoteGist-gated below, at their own two call
  // sites — a Yarn back still needs room for the avatar and the nested
  // quote beneath, so it never grows to fill the row the way a standalone
  // hero gist does.
  const heroPreviewActive = colorPickerEligible && pickedColor !== null;
  const heroPreviewHex = pickedColor ? GIST_CARD_PALETTE[GIST_COLOR_KEYS.indexOf(pickedColor)] : undefined;

  // Same shrink-to-fit as the posted card (lib/heroText) — genuinely shows
  // what posting will look like, not a separately-tuned approximation. Runs
  // synchronously after layout, before paint, so there's no flash of the
  // wrong size while typing.
  useLayoutEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    if (!heroPreviewActive || text.length === 0) {
      // Leaving hero mode, or nothing typed yet — clear the inline
      // fontSize/height fitHeroTextarea left behind, since an inline style
      // always beats the plain-mode Tailwind classes (h-full, text-[15px])
      // for the same property. Left uncleared, the textarea would keep
      // rendering at its last hero-mode size after reverting. Skipping
      // hero sizing entirely while empty also keeps the placeholder at
      // normal reading size rather than the (now fixed, not length-based)
      // hero size — there's no real text yet to apply the hero treatment
      // to.
      el.style.fontSize = "";
      el.style.height = "";
      return;
    }
    const container = heroBoxRef.current;
    if (!container) return;
    fitHeroTextarea(el, container);
  }, [text, heroPreviewActive]);

  // Picking a color swaps the textarea into the colored hero layout — jump
  // focus into it right away so typing can continue without an extra tap,
  // same as landing in the sheet itself does via the plain textarea's own
  // autoFocus.
  useEffect(() => {
    if (!heroPreviewActive) return;
    // Deferred a frame so this always wins even if the click that triggered
    // it (or anything else mid-transition) grabs focus in the same tick.
    const id = requestAnimationFrame(() => textareaRef.current?.focus({ preventScroll: true }));
    return () => cancelAnimationFrame(id);
  }, [heroPreviewActive]);

  // Existing media the user removed during this edit session — the actual
  // DELETE calls only fire on Save (matches how new picks only actually
  // upload on Save too), so closing without saving leaves the gist
  // untouched.
  const [removedMediaIds, setRemovedMediaIds] = useState<string[]>([]);
  const [showCamera, setShowCamera] = useState(false);
  const [showGifPicker, setShowGifPicker] = useState(false);
  const [posting, setPosting] = useState(false);
  // True only while this sheet has reopened ITSELF after an optimistic
  // create failed online (see handlePost) — independent of the `open`
  // prop, which the parent still thinks is false at that point (its own
  // onClose already fired when the sheet first closed optimistically).
  // The sheet stays mounted the whole time regardless of `open` (it's
  // unconditionally in the parent's JSX, not conditionally rendered), so
  // flipping this local flag alone is enough to bring it back on screen
  // with the draft untouched — no parent-side state needed for the
  // reopen itself, only for the onPostSynced/onPostFailed placeholder
  // swap. Cleared by handleModalClose (see the render below) so a
  // dismiss — backdrop tap, X, or a successful retry — doesn't leave it
  // stuck reopening itself forever.
  const [forceOpen, setForceOpen] = useState(false);
  const [error, setError] = useState<string>();
  const [showError, setShowError] = useState(false);
  // Upload percent per media item (by its local `id`, not server media_id
  // — these are only-ever-new picks mid-upload), so each thumbnail can
  // show its own real progress instead of one opaque "posting..." spinner
  // for the whole sheet.
  const [uploadProgress, setUploadProgress] = useState<Record<string, number>>({});

  // Which target (a specific gist to edit, or "a new compose") the sheet's
  // fields were last seeded for. Compared during render — React's own
  // documented pattern for "adjust state when a prop genuinely changes"
  // (see react.dev/reference/react/useState#storing-information-from-previous-renders)
  // — instead of an effect, so a real target change seeds in the same
  // render with no extra flash, and a plain close+reopen of the SAME target
  // does NOT reseed at all: closing (the X, the backdrop, Escape) doesn't
  // mean "discard" anywhere else in this app, so a draft the user hasn't
  // posted yet — text typed, media attached, maybe even still mid-upload —
  // has to still be sitting there exactly as they left it if they reopen.
  // It only actually goes away once handlePost's own reset() runs (a real
  // post/save succeeded), or the target genuinely changes (a different gist
  // to edit — showing gist A's leftover draft while meaning to edit gist B
  // would silently overwrite B with A's text/media on save, a real
  // correctness bug, not just UX). Different quotes of different gists
  // currently share the same "__new__" target (no call site varies
  // `initialText` across reopens today) — a future quote flow that does
  // would need its own key folded into `currentTarget` below.
  const [seededFor, setSeededFor] = useState<string | null>(null);
  const currentTarget = editGist?.gist_id ?? "__new__";
  if (open && seededFor !== currentTarget) {
    setSeededFor(currentTarget);
    const seedText = editGist?.gist_text ?? initialText ?? "";
    setText(seedText);
    // No color pre-picked for a fresh session — starts null until the
    // poster actually taps a swatch themselves.
    setPickedColor(null);
    setShowColorPicker(false);
    setShowPoll(false);
    setPollOptions(["", ""]);
    setIsAnonymous(false);
    setRemovedMediaIds([]);
    setMedia(
      (editGist?.media ?? []).map((m) => ({
        id: m.media_id,
        existingId: m.media_id,
        url: m.media_url,
        kind: m.media_type?.toLowerCase().includes("video") ? "video" : "image",
        name: "",
      })),
    );
  }

  // A poll's question is capped shorter than a normal gist (see showPoll's
  // own doc and LIMITS.pollGistTextMax) — mirrors the backend's own
  // POLL_GIST_TEXT_MAX_LEN check in schemas/gist.ts.
  const textMax = showPoll ? LIMITS.pollGistTextMax : LIMITS.gist;
  const remaining = textMax - text.length;

  const addMedia = (items: PickedMedia[]) => {
    setMedia((cur) => {
      const room = LIMITS.maxMediaPerGist - cur.length;
      if (room <= 0) {
        setError(`No vex. You can only upload ${LIMITS.maxMediaPerGist} media items.`);
        setShowError(true);
        return cur;
      }
      return [...cur, ...items.slice(0, room)];
    });
  };

  const onFiles = async (files: FileList | null) => {
    if (!files) return;
    const valid: File[] = [];
    let rejectedType = false;
    let rejectedSize = false;
    let rejectedSpoof = false;
    let rejectedDuration = false;

    for (const f of Array.from(files)) {
      if (!isAllowedMediaType(f.type)) {
        rejectedType = true;
        continue;
      }
      if (f.size > maxBytesFor(f.type)) {
        rejectedSize = true;
        continue;
      }
      // Confirms the file's actual bytes match its declared type — catches
      // a renamed/mislabeled file the extension/MIME checks above can't.
      if (!(await isGenuineMedia(f))) {
        rejectedSpoof = true;
        continue;
      }
      // Reject an over-length video before it ever uploads a single byte
      // — much better than finding out only after a long upload has already
      // spent time, or worse, letting the server reject it silently.
      if (f.type.startsWith("video/")) {
        try {
          const duration = await readVideoDurationSeconds(f);
          if (duration > MAX_VIDEO_DURATION_SECONDS) {
            rejectedDuration = true;
            continue;
          }
        } catch {
          /* couldn't read duration client-side (unusual codec, etc.) —
             let it through; the backend still enforces the real cap. */
        }
      }
      valid.push(f);
    }

    if (rejectedType || rejectedSpoof) {
      setError("Only real JPEG, PNG, WEBP, GIF images or MP4, WEBM, MOV videos are allowed.");
      setShowError(true);
    } else if (rejectedDuration) {
      setError(`No vex — videos can only be up to ${MAX_VIDEO_DURATION_SECONDS / 60} minutes long.`);
      setShowError(true);
    } else if (rejectedSize) {
      setError("No vex — that file too big. Max be 10MB for photos, 150MB for videos.");
      setShowError(true);
    }

    const picked: PickedMedia[] = valid.map((f) => ({
      id: crypto.randomUUID(),
      url: URL.createObjectURL(f),
      blob: f,
      kind: f.type.startsWith("video") ? "video" : "image",
      name: sanitizeFileName(f.name),
    }));
    if (picked.length) addMedia(picked);
  };

  const removeMedia = (id: string) => {
    setMedia((cur) => {
      const found = cur.find((m) => m.id === id);
      // No-op for a remote (GIPHY) URL or an existing server-side item —
      // revokeObjectURL only does anything for an actual blob: URL, so
      // this is safe to call either way.
      if (found) URL.revokeObjectURL(found.url);
      // Existing (already-uploaded) media only gets actually deleted on
      // Save — see removedMediaIds and handlePost — removing it here just
      // queues that up, same as a new pick only actually uploads on Save.
      if (found?.existingId) setRemovedMediaIds((ids) => [...ids, found.existingId!]);
      return cur.filter((m) => m.id !== id);
    });
  };

  const addGifs = (items: Array<{ url: string; width: number | null; height: number | null }>) => {
    addMedia(
      items.map(({ url, width, height }) => ({
        id: crypto.randomUUID(),
        url,
        remoteUrl: url,
        width,
        height,
        kind: "image",
        name: "gif",
      })),
    );
  };

  const reset = () => {
    media.forEach((m) => URL.revokeObjectURL(m.url));
    setText("");
    setMedia([]);
    setRemovedMediaIds([]);
    setUploadProgress({});
    setShowPoll(false);
    setPollOptions(["", ""]);
    setIsAnonymous(false);
    // Every call site here is immediately followed by onClose() — this
    // doesn't retrigger the seeding block on the spot (that block only
    // ever runs while `open` is true, and `open` is about to go false in
    // this same batched update). It just means the NEXT open genuinely
    // re-seeds instead of reusing whatever `seededFor` already equalled
    // ("__new__", forever, for every non-edit session) — without this, a
    // fresh random color (see the seeding block's own doc) only ever
    // happened once per page load, the very first time the sheet opened,
    // then silently stuck for every post after that.
    setSeededFor(null);
  };

  // Helpers for the poll option inputs below — kept close to pollOptions
  // itself rather than inlined three times in the JSX. Same
  // stripInvisibleChars-on-every-keystroke treatment the main textarea's
  // own onChange already gets (see its handler above) — without it, an
  // option could carry invisible/control characters the gist text is
  // explicitly guarded against, just because it's a different input.
  const validPollOptions = pollOptions.map((o) => sanitizeForSubmit(o)).filter(Boolean);
  // Distinct from validPollOptions.length < pollMinOptions below: that only
  // catches too FEW filled-in options overall, so 3 filled + 1 left blank
  // out of 4 boxes would silently post as a 3-option poll instead of
  // flagging the blank one. This blocks on ANY empty box while showPoll is
  // on — every option the user added a field for has to actually have text
  // (or be removed via its own trash button), not just quietly dropped.
  const hasEmptyPollOption = showPoll && pollOptions.some((o) => !sanitizeForSubmit(o));
  const updatePollOption = (index: number, value: string) =>
    setPollOptions((cur) =>
      cur.map((o, i) => (i === index ? stripInvisibleChars(value).slice(0, LIMITS.pollOptionMax) : o)),
    );
  const addPollOption = () =>
    setPollOptions((cur) => (cur.length >= LIMITS.pollMaxOptions ? cur : [...cur, ""]));
  const removePollOption = (index: number) =>
    setPollOptions((cur) => (cur.length <= LIMITS.pollMinOptions ? cur : cur.filter((_, i) => i !== index)));

  /** Turns whatever a failed upload actually threw into a specific,
   * brand-voice reason — "no vex" is this app's established error voice
   * (see the size/type rejection messages in `onFiles` above) — instead
   * of one generic "something went wrong" no matter the real cause. */
  const describeUploadFailure = (reason: unknown): string => {
    if (reason instanceof MediaUploadError) {
      if (reason.stage === "signature") {
        return `No vex — ${reason.message}`; // real reason (rate limit, server error, or an actual network drop)
      }
      if (reason.stage === "upload") {
        return `No vex — the upload didn't go through: ${reason.message}`;
      }
      return `No vex — ${reason.message}`; // "finalize": backend's own specific reason
    }
    return apiErrorMessage(reason, "No vex — something broke uploading that. Check your connection and try again.");
  };

  /** Best-effort extraction of a freshly-uploaded media item's id, for
   * rollback purposes only — the store's upload/attach calls are typed
   * `Promise<unknown>` since they just pass through whatever the backend
   * returns, so this narrows defensively rather than assuming the shape. */
  const extractMediaId = (value: unknown): string | null => {
    if (value && typeof value === "object" && "media_id" in value) {
      const id = (value as { media_id: unknown }).media_id;
      return typeof id === "string" ? id : null;
    }
    return null;
  };

  const handlePost = async () => {
    const clean = sanitizeForSubmit(text);
    if (!clean || remaining < 0) return;
    if (showPoll && (validPollOptions.length < LIMITS.pollMinOptions || hasEmptyPollOption)) return;
    setPosting(true);
    setUploadProgress({});
    // A poll needs to land for real, live, so everyone's voting against
    // the same shared tally from the moment it posts — unlike media, there
    // isn't a sensible "looks posted already, syncs for real later"
    // optimistic placeholder for it, so this fails outright with a clear
    // reason instead of silently behaving like a queued draft.
    if (showPoll && typeof navigator !== "undefined" && !navigator.onLine) {
      setPosting(false);
      setError("No vex — polls need a real connection to post, try again once you're back online.");
      setShowError(true);
      return;
    }
    // All-or-none: a media item failing must never leave the gist posted
    // with just its text (or, when editing, half-applied). Every branch
    // below uploads media FIRST and only commits the text/removals once
    // every upload has actually succeeded — on any failure, whatever DID
    // just upload in this attempt gets rolled back immediately, nothing
    // in the compose sheet is cleared, and the user can just hit Post
    // again with the exact same text and picks still sitting there.
    // Offline: a real Cloudinary upload genuinely can't happen with no
    // connection, but the picked file itself can — IndexedDB (what the
    // offline queue is built on) persists a real Blob natively, same as
    // any other value, not just plain JSON. So instead of dropping media
    // and warning about it, the raw picked file goes into the queue
    // alongside the text, and the optimistic gist shown right now reuses
    // the exact local preview PickedMedia already has (see
    // buildOfflineGistMedia in gistStore.ts) — it looks fully posted,
    // media included, immediately. The real upload happens for real once
    // back online (flushOfflineQueue), swapping the local preview for the
    // real hosted version invisibly.
    const offline = typeof navigator !== "undefined" && !navigator.onLine;
    const toQueuedMedia = (items: PickedMedia[]) =>
      items.map((m) => ({
        kind: m.kind,
        name: m.name,
        blob: m.blob,
        remoteUrl: m.remoteUrl,
        width: m.width ?? null,
        height: m.height ?? null,
      }));
    if (offline) {
      try {
        if (isEditing) {
          const gistId = editGist!.gist_id;
          const newMedia = toQueuedMedia(media.filter((m) => !m.existingId));
          await update(gistId, clean, { newMedia, removedMediaIds });
          reset();
          const keptMedia = (editGist!.media ?? []).filter((m) => !removedMediaIds.includes(m.media_id));
          const addedMedia = buildOfflineGistMedia(gistId, newMedia) ?? [];
          onPosted?.({ ...editGist!, gist_text: clean, media: [...keptMedia, ...addedMedia] }, "edited");
        } else {
          const gist = await create({
            gist_text: clean,
            color_key: colorPickerEligible ? pickedColor : null,
            media: toQueuedMedia(media),
          });
          reset();
          if (gist) onPosted?.(gist, "created");
        }
        onClose();
      } catch (err) {
        setError(apiErrorMessage(err, isEditing ? "Failed to save changes" : "Failed to create gist"));
        setShowError(true);
      } finally {
        setPosting(false);
      }
      return;
    }
    if (isEditing) {
      try {
        const gistId = editGist!.gist_id;
        const newMedia = media.filter((m) => !m.existingId);
        const uploadedIds: string[] = [];
        if (newMedia.length) {
          const results = await Promise.allSettled(
            newMedia.map((m) =>
              m.remoteUrl
                ? attachMediaUrl(gistId, m.remoteUrl, m.width, m.height)
                : uploadMedia(gistId, m.blob!, m.name, (pct) => setUploadProgress((p) => ({ ...p, [m.id]: pct }))),
            ),
          );
          for (const r of results) {
            if (r.status === "fulfilled") {
              const id = extractMediaId(r.value);
              if (id) uploadedIds.push(id);
            }
          }
          const failed = results.find((r) => r.status === "rejected");
          if (failed) {
            await Promise.all(uploadedIds.map((id) => removeMediaApi(id).catch(() => null)));
            setError(describeUploadFailure((failed as PromiseRejectedResult).reason));
            setShowError(true);
            return;
          }
        }
        // Every new media item is confirmed attached — now safe to apply
        // the text edit and any removals.
        await update(gistId, clean);
        if (removedMediaIds.length) {
          await Promise.all(removedMediaIds.map((id) => removeMediaApi(id).catch(() => null)));
        }
        const fresh = await getGist(gistId).catch(() => undefined);
        reset();
        if (fresh) onPosted?.(fresh, "edited");
        // No optimistic UI for an edit — the sheet stays open through the
        // whole upload/save chain, so the sound waits for it to actually
        // finish rather than promising "done" while it's still posting.
        playSound("whoosh");
        notifyActionSucceeded("edited");
        onClose();
      } catch (err) {
        setError(apiErrorMessage(err, "Failed to save changes"));
        setShowError(true);
      } finally {
        setPosting(false);
      }
      return;
    }

    // Brand-new post, online, with a real connection: optimistic-close.
    // Insert a locally-built placeholder (gist_id prefixed "posting-", not
    // "offline-" — this was never actually queued for later replay, so it
    // must never get swept up by flushOfflineQueue's own "strip offline-
    // prefixed gists" cleanup, which runs on ANY unrelated queue flush and
    // would wipe this one out mid-flight for no reason if it shared that
    // prefix) and close the sheet right away instead of blocking on the
    // full create+upload+refetch round trip. The real request keeps
    // running in the background:
    //  - success: onPostSynced swaps the placeholder for the real gist,
    //    same success toast as before.
    //  - failure: onPostFailed removes the placeholder, an error toast
    //    explains what happened, and the sheet reopens itself
    //    (setForceOpen) with the draft exactly as the user left it — see
    //    forceOpen's own doc for how that reopen actually works.
    setForceOpen(false);
    const tempKey = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const optimistic: Gist = {
      ...buildOfflineGist(
        { gist_text: clean, color_key: colorPickerEligible ? pickedColor : null, media: toQueuedMedia(media) },
        tempKey,
        Date.now(),
        "posting",
      ),
      ...(isAnonymous ? { is_anonymous: true } : {}),
      ...(quoteGist ? { quoted_gist_id: quoteGist.gist_id, quoted_gist: quoteGist } : {}),
    };
    const tempId = optimistic.gist_id;
    onPosted?.(optimistic, "created");
    playSound("whoosh");
    onClose();
    setPosting(false);

    try {
      // Text creates the gist row first (unavoidable with the current
      // two-step API), but if any media fails, that gist is deleted again
      // immediately rather than left behind text-only. A poll rides along
      // in this same create call (the backend attaches it server-side,
      // atomically enough — see gist.controller.ts) rather than a second
      // round trip the way media needs, since it's just plain option
      // text, nothing to upload.
      const gist = await create({
        gist_text: clean,
        color_key: colorPickerEligible ? pickedColor : null,
        ...(showPoll ? { poll: { options: validPollOptions } } : {}),
        ...(isAnonymous ? { is_anonymous: true } : {}),
        ...(quoteGist ? { quoted_gist_id: quoteGist.gist_id } : {}),
      });
      const gistId = gist!.gist_id;
      if (!showPoll && media.length) {
        const results = await Promise.allSettled(
          media.map((m) =>
            m.remoteUrl
              ? attachMediaUrl(gistId, m.remoteUrl, m.width, m.height)
              : uploadMedia(gistId, m.blob!, m.name, (pct) => setUploadProgress((p) => ({ ...p, [m.id]: pct }))),
          ),
        );
        const failed = results.find((r) => r.status === "rejected");
        if (failed) {
          await removeGistApi(gistId).catch(() => null);
          throw (failed as PromiseRejectedResult).reason;
        }
      }
      const fresh = await getGist(gistId).catch(() => undefined);
      reset();
      if (fresh) onPostSynced?.(tempId, fresh);
      notifyActionSucceeded("created");
    } catch (err) {
      console.error("[optimistic post] failed to create gist:", err);
      onPostFailed?.(tempId);
      notifyActionFailed("created");
      setForceOpen(true);
    }
  };

  return (
    <>
      <Modal
        open={open || forceOpen}
        onClose={() => {
          // Clears the self-reopen flag too — otherwise dismissing a
          // reopened-after-failure sheet (backdrop tap, X) would appear
          // to close it while forceOpen quietly stayed true, doing
          // nothing visible now but resurrecting the sheet unexpectedly
          // on some unrelated later re-render.
          setForceOpen(false);
          onClose();
        }}
        variant="sheet"
        desktopCenter
        // Yarn back gets the whole viewport, not just a taller sheet —
        // Modal's own sheet/desktopCenter sizing always caps out at
        // max-w-[520px] (or ~600px centered on desktop), which still isn't
        // "full." Passing className here bypasses that default sizing
        // entirely (see Modal's own doc on the prop), so this is true
        // full-bleed on every screen size, not just mobile.
        className={quoteGist ? "h-[100dvh] w-full" : undefined}
      >
        <div
          className={
            // Same reasoning continues into the actual content box: no
            // rounded-sheet corners or grab handle on any size — it's a
            // real full-screen page now, not a sheet that happens to be
            // tall. Two independently-rendered blocks (mine, then the
            // nested original, either of which can be its own colored
            // hero box) need real room, not the compact "one gist" sizing.
            quoteGist
              ? "flex h-full w-full flex-col rounded-none bg-brand-tint shadow-none"
              : "flex h-[80vh] flex-col rounded-t-3xl bg-brand-tint shadow-none md:h-auto md:max-h-[min(88vh,860px)] md:min-h-[min(88vh,700px)] md:rounded-3xl md:shadow-2xl md:shadow-black/20"
          }
        >
          {/* Grab handle (mobile bottom-sheet affordance, hidden once this
              becomes a real centered dialog on desktop, or for Yarn back's
              full-screen takeover where it'd be a lie) + close. Yarn back
              swaps the handle for a heading instead — a bare close button
              with no label reads as disoriented once this is a full-screen
              page rather than an obviously-a-compose-sheet. Names whose
              gist it is, not just "Yarn back" generically — useful since
              the actual quoted card can be scrolled below the fold once
              there's real text above it. No @ prefix — this app doesn't
              use that convention for avitags anywhere else (see
              QuotedGistPreview/FeedGistCard's own header). */}
          <div
            className={
              quoteGist
                ? "relative flex shrink-0 items-center justify-between px-5 pt-3 md:pt-4"
                : "relative flex shrink-0 items-center justify-center px-5 pt-3 md:justify-end md:pt-4"
            }
          >
            {quoteGist ? (
              <p className="min-w-0 truncate pr-3 font-nunito text-base font-bold text-ink">
                {quoteGist.avitag === myAvitag ? (
                  "Yarning back your gist"
                ) : (
                  <>
                    Yarning back{" "}
                    {quoteGist.is_anonymous
                      ? "Anonymous"
                      : quoteGist.first_name || quoteGist.name || quoteGist.avitag}
                    {" gist"}
                  </>
                )}
              </p>
            ) : (
              <span className="h-1.5 w-12 rounded-full bg-[#414F65] md:hidden" />
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className={
                quoteGist
                  ? "shrink-0 rounded-full p-1 text-ink md:p-1.5 md:hover:bg-black/5"
                  : "absolute right-4 rounded-full p-1 text-ink md:static md:p-1.5 md:hover:bg-black/5"
              }
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Compose — header and actions bar (below) always stay put; this
              whole middle section is the one thing that scrolls, as a unit,
              so a long caption and a full set of poll options never fight
              each other for room. Previously only the textarea scrolled
              internally while the poll/media blocks just stacked below it
              uncontained — once both were tall enough, the textarea (flex-1)
              had nowhere to go but visibly shrink toward nothing instead of
              the sheet just scrolling. overflow-y-auto here is that missing
              escape valve. */}
          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-5 pt-4 no-scrollbar">
            {/* The textarea gets a floor height (min-h-36) instead of eating
                "whatever's left" (flex-1) — that's what used to let it get
                squeezed to nothing once poll options pushed in below it. It
                can still grow a little and scrolls internally past max-h-56
                for a long caption, same as before, just never below a
                usable size. This row itself never takes the full-takeover
                flex-1 grow, hero preview or not — the avatar sits beside
                the colored box instead of the box swallowing the whole row
                (same "who's posting" anchor X/Facebook/LinkedIn's own
                compose dialogs keep even for a short colorful post), so
                there's always a sibling here sharing it. */}
            <div className="flex min-h-0 shrink-0 gap-3 items-start md:flex-none">
              {/* Who this is posting as. quoteGist gets a plain,
                  non-toggleable avatar (Yarn back is never anonymous — see
                  its own doc above); a standalone gist keeps the anonymous
                  toggle, visible in hero mode same as any other mode now. */}
              {quoteGist && (
                // Yarn back is never anonymous (see quoteGist's own doc
                // above) — plain, non-toggleable avatar, no badge.
                <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full bg-brand-light ring-1 ring-black/5">
                  <Avatar src={myImageUrl} />
                </div>
              )}
              {!quoteGist && (
                <div className="relative shrink-0">
                  {/* The whole avatar is the toggle now, not just the badge —
                      tapping the picture itself switches modes too. The badge
                      stays as a persistent, always-visible indicator of which
                      mode is active (deliberately not a first-use-only
                      animation, since going anonymous is a bigger commitment
                      than most compose actions and deserves an affordance
                      that stays obviously discoverable), but it's decorative
                      now — pointer-events-none — so a tap landing on it still
                      hits the button underneath instead of needing its own
                      handler. */}
                  <button
                    type="button"
                    onClick={() =>
                      setIsAnonymous((v) => {
                        const next = !v;
                        // Only turning it ON needs the explainer — turning
                        // it back off is just reverting to normal, nothing
                        // new to tell them about.
                        if (next) setShowAnonModal(true);
                        return next;
                      })
                    }
                    aria-label={isAnonymous ? "Post with your name" : "Post anonymously"}
                    aria-pressed={isAnonymous}
                    className={`flex h-11 w-11 items-center justify-center overflow-hidden rounded-full ring-1 transition-colors ${
                      isAnonymous ? "bg-brand-ink ring-black/5" : "bg-brand-light ring-black/5"
                    }`}
                  >
                    {isAnonymous ? (
                      <AnonymousIconFill className="h-5 w-5 text-white" />
                    ) : (
                      <Avatar src={myImageUrl} />
                    )}
                  </button>
                  <div
                    aria-hidden="true"
                    className={`pointer-events-none absolute -bottom-0.5 -right-0.5 flex h-[18px] w-[18px] items-center justify-center rounded-full ring-2 ring-brand-tint transition-colors ${
                      isAnonymous ? "bg-brand-ink text-white" : "bg-surface-2 text-faint"
                    }`}
                  >
                    <AnonymousIconFill className="h-2.5 w-2.5" />
                  </div>
                </div>
              )}
              <div
                ref={heroBoxRef}
                className={
                  heroPreviewActive
                    ? "flex min-h-0 min-w-0 flex-1 items-center justify-center overflow-hidden rounded-3xl p-4"
                    : "relative min-w-0 flex-1"
                }
                // Composer-only height bump (460, not the 160 ShortGist uses
                // on the real feed card) — width and the avatar-beside-box
                // layout stay exactly as they were, just taller while
                // actually composing. This is a deliberate preview/reality
                // mismatch: the box feels roomier to type into, even though
                // the real posted card still renders compact — see this
                // block's own history for why that trade was made on
                // purpose rather than also inflating ShortGist.
                style={heroPreviewActive ? { backgroundColor: heroPreviewHex, minHeight: 460 } : undefined}
              >
                {/* One persistent element regardless of mode — swapping in a
                    second, differently-styled textarea on toggle would
                    remount it and drop focus/cursor position mid-keystroke
                    right as someone crosses the length threshold. */}
                <textarea
                  ref={textareaRef}
                  autoFocus
                  value={text}
                  onChange={(e) => setText(stripInvisibleChars(e.target.value).slice(0, textMax))}
                  onScroll={updateScrollThumb}
                  placeholder={typedPlaceholder}
                  className={
                    heroPreviewActive
                      ? "w-full resize-none overflow-hidden bg-transparent text-center font-nunito font-bold leading-snug text-white outline-none placeholder:text-white/60 no-scrollbar"
                      : "min-h-36 max-h-56 w-full resize-none overflow-y-auto bg-transparent py-2 pr-3 font-nunito text-[15px] leading-relaxed text-ink outline-none placeholder:text-faint no-scrollbar md:h-40 md:max-h-none"
                  }
                />
                {/* A sleeker stand-in for the native scrollbar (hidden via
                    no-scrollbar above) — same idea, just styled to match.
                    Hero-preview mode auto-sizes (no internal scroll), so
                    this never applies there. */}
                {!heroPreviewActive && scrollThumb && (
                  <div className="pointer-events-none absolute right-0 top-2 bottom-2 w-1 rounded-full bg-black/5 dark:bg-white/10">
                    <div
                      className="absolute w-full rounded-full bg-brand/50"
                      style={{ top: `${scrollThumb.top}%`, height: `${scrollThumb.height}%` }}
                    />
                  </div>
                )}
              </div>
            </div>


            {/* Poll options — 2 to LIMITS.pollMaxOptions, styled as a live
                preview of the actual vote pill (see PollBlock's own option
                buttons: rounded-2xl, ring-1, a brand-tinted fill) rather
                than plain form fields — what gets typed here is already a
                near-exact preview of what a voter will see, just without a
                percentage yet. Wrapped in its own tinted card (shrink-0, so
                it never competes with the textarea for the flex-1 budget
                that used to squeeze it — see the scroll container above)
                so it reads as one distinct block, not more stacked inputs
                trailing off the caption. */}
            {showPoll && (
              <div className="mt-3 flex shrink-0 flex-col gap-2 rounded-2xl bg-white/40 p-3 ring-1 ring-black/5 dark:bg-white/5">
                <span className="flex items-center gap-1.5 px-0.5 font-nunito text-[11px] font-bold uppercase tracking-wide text-brand">
                  <PollIconFill className="h-3.5 w-3.5" weight="fill" />
                  Poll options
                </span>
                {pollOptions.map((option, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-2 rounded-2xl bg-brand/[0.06] px-2.5 py-2 ring-1 ring-black/10 transition focus-within:ring-2 focus-within:ring-brand dark:bg-white/10"
                  >
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white/80 font-nunito text-[11px] font-bold text-brand dark:bg-white/10">
                      {i + 1}
                    </span>
                    <input
                      type="text"
                      value={option}
                      onChange={(e) => updatePollOption(i, e.target.value)}
                      placeholder={`Option ${i + 1}`}
                      maxLength={LIMITS.pollOptionMax}
                      className="min-w-0 flex-1 bg-transparent font-nunito text-sm font-semibold text-ink outline-none placeholder:font-normal placeholder:text-faint"
                    />
                    {pollOptions.length > LIMITS.pollMinOptions && (
                      <button
                        type="button"
                        onClick={() => removePollOption(i)}
                        aria-label={`Remove option ${i + 1}`}
                        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-faint transition hover:bg-black/10 hover:text-danger active:scale-90"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                ))}
                {pollOptions.length < LIMITS.pollMaxOptions && (
                  <button
                    type="button"
                    onClick={addPollOption}
                    className="flex items-center justify-center gap-1.5 rounded-2xl border border-dashed border-brand/40 py-2.5 font-nunito text-xs font-semibold text-brand transition hover:bg-brand/10 active:scale-[0.98]"
                  >
                    <PlusIcon className="h-3.5 w-3.5" />
                    Add option
                  </button>
                )}
              </div>
            )}

            {/* Attached media — kept small and out of the way (fixed-size
                thumbnails, not a growing aspect-square grid) so it never
                eats into the textarea's room; it's a preview strip, not the
                main content of the compose view. Before anything's attached,
                this is the one place the 2-media cap gets mentioned at all —
                otherwise nothing tells you the limit exists until you've
                already hit it. Hidden entirely in poll mode — the two are
                mutually exclusive, so there's nothing here worth mentioning
                while showPoll is on. */}
            {!showPoll && media.length === 0 && (
              <p className="mt-3 font-nunito text-xs text-faint">
                You can attach up to {LIMITS.maxMediaPerGist} photos or videos.
              </p>
            )}

            {!showPoll && media.length > 0 && (
              <div className="mt-3 flex shrink-0 flex-wrap gap-2 pb-2">
                {media.map((m) => (
                  <div
                    key={m.id}
                    className="relative h-20 w-20 shrink-0 overflow-hidden rounded-xl bg-black/5"
                  >
                    {m.kind === "video" ? (
                      <MediaVideo src={m.url} className="h-full w-full object-cover" muted />
                    ) : (
                      <MediaImage src={m.url} alt="" className="h-full w-full object-cover" />
                    )}
                    {m.kind === "video" && (
                      <Video className="absolute left-1 top-1 h-4 w-4 text-white drop-shadow" />
                    )}
                    {/* Real upload progress, not a guess — only shows while
                        this specific item is actually mid-upload (posting,
                        no existingId/remoteUrl since those skip the upload
                        step entirely, and not yet 100%). */}
                    {posting && !m.existingId && !m.remoteUrl && (uploadProgress[m.id] ?? 0) < 100 && (
                      <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                        <UploadProgressRing percent={uploadProgress[m.id] ?? 0} />
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={() => removeMedia(m.id)}
                      aria-label="Remove"
                      className="absolute right-1 top-1 rounded-full bg-black/60 p-0.5 text-white"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Yarn back — the gist being quoted, nested read-only last —
                after MY text, MY poll, and MY media, never splitting them
                up. Everything above this point is mine; this is the one
                thing here that isn't, so it sits on its own below all of
                it, same grouping any quote-post elsewhere gets right.
                Shared with FeedGistCard/ProfileGistCard (QuotedGistPreview
                in GistCard.tsx) rather than a second copy of this markup
                here — that's what actually renders it exactly as it was
                originally posted (its own color_key/hero status, media
                thumbnail, redaction) with one definition to keep in sync,
                not two that can quietly drift apart. */}
            {quoteGist && <QuotedGistPreview gist={quoteGist} />}
          </div>

          {/* Actions */}
          <div className="shrink-0 space-y-5 border-t border-white/40 px-5 py-4">
            {/* Background-color swatch strip — its own row directly above
                the icon row the palette button lives in (not squeezed
                beside that button): 12 swatches need real width, and
                cramming them next to camera/image/gif on a narrow mobile
                sheet forced an awkward wrap right against unrelated
                buttons. This still reads as "belonging" to the palette
                button since it's the row immediately above it. Only
                reachable via that button, and only ever rendered while a
                pick would actually show up (colorPickerEligible): the
                colored hero block this controls only renders for short,
                media-free gists (matches GistCard's own `short` check), so
                offering it any other time would be a dead affordance. */}
            {showColorPicker && colorPickerEligible && (
              <div className="flex flex-wrap gap-2">
                {GIST_COLOR_KEYS.map((key, i) => (
                  <button
                    key={key}
                    type="button"
                    // Swatches are a toolbar action on the textarea, not a
                    // destination of their own — stop the browser's default
                    // focus-follows-click from ever moving focus onto the
                    // button, so the caret just stays put in the textarea
                    // (or lands there via the effect below) instead of a
                    // race between the button grabbing it and us taking it
                    // back.
                    onMouseDown={(e) => e.preventDefault()}
                    // Tapping the already-active swatch again deselects it,
                    // back to null — "no color" still isn't truly colorless
                    // on the feed itself (a null color_key falls back to a
                    // deterministic hash-based one there — see ShortGist's
                    // fallbackSeed), it just means "let the system pick."
                    onClick={() => setPickedColor((c) => (c === key ? null : key))}
                    aria-label={`${key} background`}
                    aria-pressed={pickedColor === key}
                    className={`h-7 w-7 shrink-0 rounded-full ring-2 ring-offset-2 ring-offset-brand-tint transition active:scale-90 ${
                      pickedColor === key ? "ring-brand" : "ring-transparent"
                    }`}
                    style={{ backgroundColor: GIST_CARD_PALETTE[i] }}
                  />
                ))}
              </div>
            )}
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => setShowCamera(true)}
                aria-label="Open camera"
                disabled={showPoll || media.length >= LIMITS.maxMediaPerGist}
                className="flex h-11 w-11 items-center justify-center rounded-full bg-brand text-white shadow-sm shadow-brand/30 transition hover:bg-brand-dark active:scale-95 disabled:opacity-40 disabled:shadow-none disabled:active:scale-100"
              >
                <CameraIconFill className="h-5 w-5" weight="fill" />
              </button>
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                aria-label="Add photos or videos"
                disabled={showPoll || media.length >= LIMITS.maxMediaPerGist}
                className="flex h-11 w-11 items-center justify-center rounded-full bg-brand text-white shadow-sm shadow-brand/30 transition hover:bg-brand-dark active:scale-95 disabled:opacity-40 disabled:shadow-none disabled:active:scale-100"
              >
                <ImageIconFill className="h-5 w-5" weight="fill" />
              </button>
              <button
                type="button"
                onClick={() => setShowGifPicker(true)}
                aria-label="Add a GIF or sticker"
                disabled={showPoll || media.length >= LIMITS.maxMediaPerGist}
                className="flex h-11 w-11 items-center justify-center rounded-full bg-brand text-white shadow-sm shadow-brand/30 transition hover:bg-brand-dark active:scale-95 disabled:opacity-40 disabled:shadow-none disabled:active:scale-100"
              >
                <Sticker className="h-5 w-5" />
              </button>
              {/* Poll — create-only (see this component's own doc on
                  showPoll) and mutually exclusive with media in the other
                  direction too: picking a poll disables the three buttons
                  above, and having any media already attached disables
                  this one, rather than letting either silently clobber the
                  other. */}
              {!isEditing && (
                <button
                  type="button"
                  onClick={() =>
                    setShowPoll((v) => {
                      const next = !v;
                      if (next) {
                        setShowColorPicker(false);
                        // pickedColor is deliberately left alone here — same
                        // as attaching media never clears it either (see
                        // colorPickerEligible's own doc): it's already
                        // excluded from both the hero preview and the POST
                        // payload the instant showPoll is true, so there's
                        // nothing to protect by nulling it out too. Leaving
                        // it be is what lets turning the poll back off
                        // restore the SAME color rather than losing it,
                        // exactly like removing an attached image does.
                        //
                        // Deliberately NOT trimming `text` down to the
                        // poll's shorter cap here. Whatever was already
                        // typed stays exactly as typed — if it's over
                        // LIMITS.pollGistTextMax, `remaining` just goes
                        // negative (same mechanism the normal 700-char cap
                        // already relies on), CharCountRing goes red, and
                        // Post stays disabled until the user trims it
                        // themselves. Silently deleting whatever came after
                        // character 150 the instant this button is tapped —
                        // with no edit to the text itself, no warning, no
                        // undo — is real, unrecoverable data loss; letting
                        // them see the overage and cut it themselves isn't.
                      }
                      return next;
                    })
                  }
                  aria-label={showPoll ? "Remove poll" : "Add a poll"}
                  aria-pressed={showPoll}
                  disabled={media.length > 0}
                  className={`flex h-11 w-11 items-center justify-center rounded-full text-white shadow-sm transition active:scale-95 disabled:opacity-40 disabled:shadow-none disabled:active:scale-100 ${
                    showPoll ? "bg-brand-dark shadow-brand/40" : "bg-brand shadow-brand/30 hover:bg-brand-dark"
                  }`}
                >
                  <PollIconFill className="h-5 w-5" weight="fill" />
                </button>
              )}
              <input
                ref={fileRef}
                type="file"
                accept={ALLOWED_MEDIA_TYPES.join(",")}
                multiple
                hidden
                onChange={(e) => {
                  void onFiles(e.target.files);
                  e.target.value = "";
                }}
              />
              <div className="ml-auto flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowColorPicker((v) => !v)}
                  aria-label="Choose a background color"
                  aria-pressed={showColorPicker}
                  disabled={!colorPickerEligible}
                  // Shows the actual picked color now that one's always on
                  // while eligible, rather than a generic brand-blue toggle
                  // icon that gave no hint a color was even active.
                  style={heroPreviewHex ? { backgroundColor: heroPreviewHex } : undefined}
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white shadow-sm transition active:scale-95 disabled:opacity-30 disabled:shadow-none disabled:active:scale-100 ${
                    heroPreviewHex
                      ? "shadow-black/20"
                      : showColorPicker
                        ? "bg-brand-dark shadow-brand/40"
                        : "bg-brand shadow-brand/30 hover:bg-brand-dark"
                  }`}
                >
                  <PaletteIconFill className="h-4 w-4" weight="fill" />
                </button>
                <CharCountRing length={text.length} max={textMax} />
              </div>
            </div>

            <div className="mt-1 flex justify-center">
              <Button
                onClick={handlePost}
                disabled={
                  !text.trim() ||
                  remaining < 0 ||
                  posting ||
                  (showPoll && (validPollOptions.length < LIMITS.pollMinOptions || hasEmptyPollOption))
                }
                loading={posting}
                fullWidth={false}
                className="w-80 px-10"
              >
                {posting ? null : isEditing ? "Save Changes" : quoteGist ? "Yarn back" : "Create Gist"}
              </Button>
            </div>
          </div>
        </div>
      </Modal>

      {showCamera && (
        <WebcamCapture
          onClose={() => setShowCamera(false)}
          onCapture={(blob, url) => {
            addMedia([
              { id: crypto.randomUUID(), url, blob, kind: "image", name: "camera.jpg" },
            ]);
            setShowCamera(false);
          }}
        />
      )}

      <GiphyPicker
        open={showGifPicker}
        onClose={() => setShowGifPicker(false)}
        onAttach={addGifs}
        maxSelectable={LIMITS.maxMediaPerGist - media.length}
      />

      <ErrorModal open={showError} onClose={() => setShowError(false)} message={error} />
      <AnonymousModeModal open={showAnonModal} onClose={() => setShowAnonModal(false)} />
    </>
  );
}
