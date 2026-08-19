"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Avatar } from "@/components/ui/Avatar";
import { ErrorModal } from "@/components/ui/FeedbackModal";
import { WebcamCapture } from "./WebcamCapture";
import { GiphyPicker } from "./GiphyPicker";
import { CameraIconFill, ImageIconFill, PaletteIconFill, X, Video, Sticker } from "@/components/ui/icons";
import { useGistStore, MediaUploadError } from "@/stores/gistStore";
import { useAuthStore } from "@/stores/authStore";
import { apiErrorMessage } from "@/lib/api";
import { LIMITS, GIST_CARD_PALETTE, GIST_COLOR_KEYS, type GistColorKey } from "@/lib/brand";
import { fitHeroTextarea, nominalHeroTextRem } from "@/lib/heroText";
import { stripInvisibleChars, sanitizeForSubmit, sanitizeFileName } from "@/lib/sanitize";
import {
  ALLOWED_MEDIA_TYPES,
  maxBytesFor,
  isAllowedMediaType,
  isGenuineMedia,
  MAX_VIDEO_DURATION_SECONDS,
  readVideoDurationSeconds,
} from "@/lib/mediaValidation";
import type { Gist } from "@/types";

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

// Thresholds scale with LIMITS.gist (20%/10% of the limit remaining), so
// they stay proportionally meaningful if the limit ever changes again.
// Punchier, more saturated than the app's semantic success/warning/danger
// tokens (those are tuned for subtle badges/borders, not a small filled
// ring that needs to actually read as a color at a glance).
function countColor(remaining: number): string {
  if (remaining > LIMITS.gist * 0.2) return "#22c55e";
  if (remaining > LIMITS.gist * 0.1) return "#f59e0b";
  return "#ef4444";
}

/** Twitter/X-style char-count ring: an empty track that fills clockwise as
 * the limit approaches, swapping in the remaining number only once it's
 * actually worth drawing attention to (close to/over the limit) — otherwise
 * the ring alone is the whole signal, same as it works everywhere else. */
function CharCountRing({ length, max }: { length: number; max: number }) {
  const remaining = max - length;
  const size = 26;
  const stroke = 2.5;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = Math.min(length / max, 1);
  const color = countColor(remaining);
  const showNumber = remaining <= max * 0.1;

  return (
    <div className="relative flex h-7 w-7 shrink-0 items-center justify-center">
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
  initialText,
  placeholder,
  editGist,
}: {
  open: boolean;
  onClose: () => void;
  /** Fires with the fresh, fully-joined gist (real media/counts/reactions,
   * not just the bare row create/update return on their own) once posting
   * or saving actually finishes — lets the caller splice it into whatever
   * list it's already showing instead of blindly refetching the entire
   * feed, which used to throw away scroll position and any pages loaded
   * past the first. `mode` distinguishes a brand-new post (append
   * somewhere) from an edit (replace the existing entry in place). */
  onPosted?: (gist: Gist, mode: "created" | "edited") => void;
  initialText?: string;
  /** Whatever the compose trigger's rotating prompt was showing at the
   * moment it got clicked — falls back to a static default when opened some
   * other way (e.g. quoting a gist) where there's no trigger prompt to match. */
  placeholder?: string;
  /** Editing an existing gist instead of composing a new one — pre-fills
   * the text and media, and swaps the submit action to update-in-place. */
  editGist?: Gist;
}) {
  const { create, update, uploadMedia, attachMediaUrl, removeMedia: removeMediaApi, remove: removeGistApi, get: getGist } = useGistStore();
  const myImageUrl = useAuthStore(
    (s) => (s.profiles.find((p) => p.avitag === s.avitag)?.image_url as string | undefined) ?? null
  );
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

  // Quoting a gist (or editing one) opens this sheet pre-filled — re-seed
  // the text each time it's opened (not just on mount) since the sheet can
  // be reused across different quotes/edits.
  useEffect(() => {
    if (open) {
      setText(editGist?.gist_text ?? initialText ?? "");
      setPickedColor(null);
      setShowColorPicker(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editGist?.gist_id]);

  // Types out the compose trigger's snapshotted prompt (see the `placeholder`
  // prop doc above) into the textarea's own placeholder, once, each time the
  // sheet opens — the "notice me" typing effect that used to run continuously
  // in the background on the trigger button itself now happens here instead,
  // aimed at whichever single prompt got picked at click time. Editing/quoting
  // (no `placeholder` passed) just shows the static default, no animation —
  // there's no freshly-picked prompt behind it to justify one.
  const [typedPlaceholder, setTypedPlaceholder] = useState("");
  useEffect(() => {
    if (!open) return;
    if (!placeholder) {
      setTypedPlaceholder(DEFAULT_PLACEHOLDER);
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
  }, [open, placeholder]);

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
  // Same rendering rule GistCard uses to decide "colored hero card vs plain
  // text + media" (SHORT_TEXT there) — a color pick only ever matters while
  // this is true, since otherwise the plain layout never shows it at all.
  // Also creation-only for now: `update()` doesn't send color_key through to
  // the backend's PATCH route, so offering the picker mid-edit would look
  // like it works and then silently not save.
  const colorPickerEligible = !isEditing && text.length < 200 && media.length === 0;
  // Live WYSIWYG preview only kicks in once an actual pick has been made —
  // before that there's no way to know what the eventual gist_id-hash-based
  // fallback color would be (it doesn't exist yet), so showing some
  // arbitrary placeholder color would be a preview of nothing real.
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
      // rendering at its last hero-mode size after reverting. The
      // empty-text case matters specifically for the placeholder: at length
      // 0, nominalHeroTextRem would hand back the MAX hero size (shortest
      // "text" reads biggest), which the placeholder — sharing the same
      // element's font-size — would inherit and render huge. Skipping the
      // hero sizing entirely while empty keeps the placeholder at normal
      // reading size; real hero scaling only kicks in once there's actual
      // text to size for its own length.
      el.style.fontSize = "";
      el.style.height = "";
      return;
    }
    const container = heroBoxRef.current;
    if (!container) return;
    fitHeroTextarea(el, container, nominalHeroTextRem(text.length));
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
  const [error, setError] = useState<string>();
  const [showError, setShowError] = useState(false);
  // Upload percent per media item (by its local `id`, not server media_id
  // — these are only-ever-new picks mid-upload), so each thumbnail can
  // show its own real progress instead of one opaque "posting..." spinner
  // for the whole sheet.
  const [uploadProgress, setUploadProgress] = useState<Record<string, number>>({});

  // Seeds the existing gist's own media as removable/reorderable thumbnails
  // when opening in edit mode — re-seeded each time the sheet opens (not
  // just on mount) for the same reason the text effect above is, and reset
  // to empty for a fresh compose/quote so leftover state from a previous
  // edit session never leaks in.
  useEffect(() => {
    if (!open) return;
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editGist?.gist_id]);

  const remaining = LIMITS.gist - text.length;

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
  };

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
    setPosting(true);
    setUploadProgress({});
    // All-or-none: a media item failing must never leave the gist posted
    // with just its text (or, when editing, half-applied). Every branch
    // below uploads media FIRST and only commits the text/removals once
    // every upload has actually succeeded — on any failure, whatever DID
    // just upload in this attempt gets rolled back immediately, nothing
    // in the compose sheet is cleared, and the user can just hit Post
    // again with the exact same text and picks still sitting there.
    try {
      if (isEditing) {
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
        onClose();
      } else {
        // Text creates the gist row first (unavoidable with the current
        // two-step API), but if any media fails, that gist is deleted
        // again immediately rather than left behind text-only.
        const gist = await create({
          gist_text: clean,
          color_key: colorPickerEligible ? pickedColor : null,
        });
        const gistId = gist!.gist_id;
        if (media.length) {
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
            setError(describeUploadFailure((failed as PromiseRejectedResult).reason));
            setShowError(true);
            return;
          }
        }
        const fresh = await getGist(gistId).catch(() => undefined);
        reset();
        if (fresh) onPosted?.(fresh, "created");
        onClose();
      }
    } catch (err) {
      setError(apiErrorMessage(err, isEditing ? "Failed to save changes" : "Failed to create gist"));
      setShowError(true);
    } finally {
      setPosting(false);
    }
  };

  return (
    <>
      <Modal open={open} onClose={onClose} variant="sheet" desktopCenter>
        <div className="flex h-[80vh] flex-col rounded-t-3xl bg-brand-tint shadow-none md:h-auto md:max-h-[min(88vh,860px)] md:min-h-[min(88vh,700px)] md:rounded-3xl md:shadow-2xl md:shadow-black/20">
          {/* Grab handle (mobile bottom-sheet affordance, hidden once this
              becomes a real centered dialog on desktop) + close */}
          <div className="relative flex shrink-0 items-center justify-center px-5 pt-3 md:justify-end md:pt-4">
            <span className="h-1.5 w-12 rounded-full bg-[#414F65] md:hidden" />
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="absolute right-4 rounded-full p-1 text-ink md:static md:p-1.5 md:hover:bg-black/5"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Compose — avatar and the media strip below stay put; only the
              textarea itself scrolls internally once its own text overflows
              its fixed height, so a long draft never pushes media (or the
              header/actions) out of view. */}
          <div className="flex min-h-0 flex-1 flex-col px-5 pt-4 md:flex-none">
            {/* flex-1 here (mobile only) is what actually gives the
                textarea most of the sheet's now-much-taller 80vh — it eats
                whatever's left after the header and the actions bar below,
                and the textarea itself (h-full) fills that. Desktop keeps
                its original fixed h-40 behavior (md:flex-none/md:h-40),
                since its container is already generously sized on its own. */}
            <div className="flex min-h-0 flex-1 items-stretch gap-3 md:flex-none md:items-start">
              {/* Who this is posting as — same anchor X/Facebook/LinkedIn's
                  own compose dialogs use, so it doesn't read as posting into
                  a void. Hidden in hero-preview mode: the actual posted
                  colored hero block never has an avatar inside it either
                  (that lives in the card's header, separately), so keeping
                  it here would make the preview lie about its own layout. */}
              {!heroPreviewActive && (
                <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full bg-brand-light ring-1 ring-black/5">
                  <Avatar src={myImageUrl} />
                </div>
              )}
              <div
                ref={heroBoxRef}
                className={
                  heroPreviewActive
                    ? "flex min-h-0 min-w-0 flex-1 items-center justify-center overflow-hidden rounded-3xl p-4"
                    : "relative min-w-0 flex-1"
                }
                style={heroPreviewActive ? { backgroundColor: heroPreviewHex, minHeight: 160 } : undefined}
              >
                {/* One persistent element regardless of mode — swapping in a
                    second, differently-styled textarea on toggle would
                    remount it and drop focus/cursor position mid-keystroke
                    right as someone crosses the length threshold. */}
                <textarea
                  ref={textareaRef}
                  autoFocus
                  value={text}
                  onChange={(e) => setText(stripInvisibleChars(e.target.value).slice(0, LIMITS.gist))}
                  onScroll={updateScrollThumb}
                  placeholder={typedPlaceholder}
                  className={
                    heroPreviewActive
                      ? "w-full resize-none overflow-hidden bg-transparent text-center font-nunito font-bold leading-snug text-white outline-none placeholder:text-white/60 no-scrollbar"
                      : "h-full w-full resize-none overflow-y-auto bg-transparent py-2 pr-3 font-nunito text-[15px] leading-relaxed text-ink outline-none placeholder:text-faint no-scrollbar md:h-40"
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

            {/* Attached media — kept small and out of the way (fixed-size
                thumbnails, not a growing aspect-square grid) so it never
                eats into the textarea's room; it's a preview strip, not the
                main content of the compose view. Before anything's attached,
                this is the one place the 2-media cap gets mentioned at all —
                otherwise nothing tells you the limit exists until you've
                already hit it. */}
            {media.length === 0 && (
              <p className="mt-3 font-nunito text-xs text-faint">
                You can attach up to {LIMITS.maxMediaPerGist} photos or videos.
              </p>
            )}

            {media.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2 pb-2">
                {media.map((m) => (
                  <div
                    key={m.id}
                    className="relative h-20 w-20 shrink-0 overflow-hidden rounded-xl bg-black/5"
                  >
                    {m.kind === "video" ? (
                      <video src={m.url} className="h-full w-full object-cover" muted />
                    ) : (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={m.url} alt="" className="h-full w-full object-cover" />
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
                disabled={media.length >= LIMITS.maxMediaPerGist}
                className="flex h-11 w-11 items-center justify-center rounded-full bg-brand text-white shadow-sm shadow-brand/30 transition hover:bg-brand-dark active:scale-95 disabled:opacity-40 disabled:shadow-none disabled:active:scale-100"
              >
                <CameraIconFill className="h-5 w-5" weight="fill" />
              </button>
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                aria-label="Add photos or videos"
                disabled={media.length >= LIMITS.maxMediaPerGist}
                className="flex h-11 w-11 items-center justify-center rounded-full bg-brand text-white shadow-sm shadow-brand/30 transition hover:bg-brand-dark active:scale-95 disabled:opacity-40 disabled:shadow-none disabled:active:scale-100"
              >
                <ImageIconFill className="h-5 w-5" weight="fill" />
              </button>
              <button
                type="button"
                onClick={() => setShowGifPicker(true)}
                aria-label="Add a GIF or sticker"
                disabled={media.length >= LIMITS.maxMediaPerGist}
                className="flex h-11 w-11 items-center justify-center rounded-full bg-brand text-white shadow-sm shadow-brand/30 transition hover:bg-brand-dark active:scale-95 disabled:opacity-40 disabled:shadow-none disabled:active:scale-100"
              >
                <Sticker className="h-5 w-5" />
              </button>
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
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white shadow-sm transition active:scale-95 disabled:opacity-30 disabled:shadow-none disabled:active:scale-100 ${
                    showColorPicker ? "bg-brand-dark shadow-brand/40" : "bg-brand shadow-brand/30 hover:bg-brand-dark"
                  }`}
                >
                  <PaletteIconFill className="h-4 w-4" weight="fill" />
                </button>
                <CharCountRing length={text.length} max={LIMITS.gist} />
              </div>
            </div>

            <div className="mt-1 flex justify-center">
              <Button
                onClick={handlePost}
                disabled={!text.trim() || remaining < 0 || posting}
                fullWidth={false}
                className="w-80 px-10"
              >
                {posting ? (isEditing ? "Saving…" : "Creating gist…") : isEditing ? "Save Changes" : "Create Gist"}
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
    </>
  );
}
