/** Splices a Cloudinary transformation string right after `/upload/` — the
 * shared plumbing both `cloudinarySmartCrop` and `cloudinarySrcSet` build
 * on. Returns the URL untouched if it isn't actually a Cloudinary delivery
 * URL (GIFs attached from GIPHY, for instance). */
function withCloudinaryTransform(url: string, transform: string): string {
  const marker = "/upload/";
  const idx = url.indexOf(marker);
  if (!url.includes("res.cloudinary.com") || idx === -1) return url;
  const insertAt = idx + marker.length;
  return `${url.slice(0, insertAt)}${transform}/${url.slice(insertAt)}`;
}

/**
 * Requests Cloudinary's own content-aware crop (g_auto — finds the actual
 * interesting region of the photo: faces, high-contrast areas, etc. — not a
 * blind "always crop from the top" guess) baked into the delivered image
 * itself, at a fixed representative aspect ratio matching the feed card's
 * media box. CSS `object-cover` on the frontend still does the final crop
 * to whatever the box's *actual* live ratio is at a given viewport, but
 * since the source is already well-composed by then, that residual crop
 * rarely cuts anything important.
 *
 * A no-op for anything that isn't actually a Cloudinary delivery URL (GIFs
 * attached from GIPHY, for instance) — those pass through untouched.
 */
export function cloudinarySmartCrop(url: string, aspectRatio = "4:3"): string {
  // f_auto/q_auto: Cloudinary picks the lightest format (AVIF/WebP where the
  // browser supports it) and quality per-request instead of serving back
  // whatever format/quality the original upload happened to be — smaller
  // payloads load faster and are less likely to time out on weak mobile
  // connections, which is where a load failure is most likely anyway.
  return withCloudinaryTransform(url, `c_fill,g_auto,ar_${aspectRatio},f_auto,q_auto`);
}

// Matches the real container width gist media renders at across the app
// today (GistMediaGrid's MediaTile, shared by the feed and the profile
// page) — capped at max-w-[740px] from md (768px) up, full viewport width
// below it. A phone on a weak connection was downloading the exact
// same pixel dimensions as a 1440px desktop monitor before this; now it
// only fetches however many pixels its own viewport can actually show.
const RESPONSIVE_WIDTHS = [420, 620, 740, 1080, 1480] as const;

/**
 * Same smart-crop transform as `cloudinarySmartCrop`, generated at several
 * widths as a ready-to-use `srcset` string — pass straight to an `<img
 * srcSet>`/`MediaImage srcSet` alongside a `sizes` attribute describing how
 * large the image actually renders, and the browser picks whichever
 * candidate is closest instead of always downloading the largest one.
 * `undefined` for anything that isn't a Cloudinary URL (same GIF/GIPHY
 * exception as cloudinarySmartCrop) — a srcSet of one identical candidate
 * repeated per width would just be wasted bytes describing no real choice.
 */
export function cloudinarySrcSet(url: string, aspectRatio = "4:3"): string | undefined {
  if (!url.includes("res.cloudinary.com") || !url.includes("/upload/")) return undefined;
  return RESPONSIVE_WIDTHS.map(
    (w) => `${withCloudinaryTransform(url, `c_fill,g_auto,ar_${aspectRatio},w_${w},f_auto,q_auto`)} ${w}w`,
  ).join(", ");
}

/**
 * Genuinely non-cropping counterpart to `cloudinarySmartCrop` — `c_limit`
 * only ever scales an image DOWN if it's bigger than the given width (never
 * up, and never crops), so the full original photo survives untouched.
 * `cloudinarySmartCrop`'s `c_fill,ar_4:3` forces every delivered image into
 * one fixed ratio server-side, before the browser (or any CSS `object-fit`
 * choice) ever gets a say — fine for a deliberately-cropped tile, wrong for
 * anywhere the whole point is showing the photo's real, un-cropped shape
 * (see GistMediaGrid.tsx's fitHeightPx path). Server-side and client-side
 * both have to agree not to crop — fixing only one half would leave the
 * other quietly cutting the photo down anyway. */
export function cloudinaryFit(url: string, maxWidth = 1080): string {
  return withCloudinaryTransform(url, `c_limit,w_${maxWidth},f_auto,q_auto`);
}

/** srcSet counterpart to `cloudinaryFit` — same reasoning as
 * `cloudinarySrcSet`, just never cropping. */
export function cloudinaryFitSrcSet(url: string): string | undefined {
  if (!url.includes("res.cloudinary.com") || !url.includes("/upload/")) return undefined;
  return RESPONSIVE_WIDTHS.map(
    (w) => `${withCloudinaryTransform(url, `c_limit,w_${w},f_auto,q_auto`)} ${w}w`,
  ).join(", ");
}

/**
 * Delivery-side codec negotiation for video — the same `f_auto` job it
 * already does for images, just for the video's own codec/container this
 * time. Without it, a video is served back in whatever codec the
 * uploading device recorded it in, verbatim: the upload pipeline
 * (media.controller.ts's `eager` param) only ever generates a JPG poster
 * frame, it never transcodes the video itself. An iPhone records in HEVC
 * by default, and Chrome — desktop and Android alike, most of this app's
 * viewers — can't decode HEVC in a plain `<video>` tag, so any video
 * someone uploaded from an iPhone would otherwise fail to play for
 * everyone except other Safari/iOS viewers. `f_auto` here picks whichever
 * codec/container the requesting browser actually supports (H.264 for
 * most, VP9/WebM where that's preferred) — the exact same negotiation, not
 * a special case for this one codec.
 */
export function cloudinaryVideo(url: string): string {
  return withCloudinaryTransform(url, "f_auto,q_auto");
}

/** What the backend's `GET /gists/:id/media/signature` hands back — enough
 * for the browser to upload straight to Cloudinary itself afterward. */
export interface CloudinarySignature {
  signature: string;
  timestamp: number;
  api_key: string;
  cloud_name: string;
  folder: string;
  upload_url: string;
}

export interface CloudinaryUploadResult {
  secure_url: string;
  public_id: string;
  resource_type: "image" | "video";
  bytes: number;
  duration?: number;
  width?: number;
  height?: number;
}

/** A Cloudinary-shaped error response, distinct from a network failure —
 * lets callers show Cloudinary's own real reason ("File size too large",
 * "Invalid image file", etc.) instead of a made-up generic message. */
export class CloudinaryUploadError extends Error {}

// A dropped connection or a timeout mid-upload is almost always transient
// (mobile network handoff, a brief dead spot) — retrying the same request
// recovers it without the user ever noticing. A real rejection (bad
// signature, invalid file, too large) is deterministic and retrying just
// wastes the user's data/time, so only network-level failures and
// Cloudinary's own 5xx (its problem, not the file's) get retried; any 4xx
// fails immediately.
const MAX_UPLOAD_ATTEMPTS = 3;
const UPLOAD_RETRY_BASE_DELAY_MS = 1000;

function isRetryableStatus(status: number): boolean {
  return status >= 500;
}

/**
 * Uploads a file straight from the browser to Cloudinary, using a
 * signature this app's own backend already computed (see
 * `gistStore.uploadMedia`) — the file's bytes never pass through this
 * app's own server or its Next.js proxy at all, which is the whole point:
 * no platform request-body-size ceiling, no shared-with-everything-else
 * request timeout, and real upload progress (XHR, not fetch, specifically
 * because fetch has no upload-progress event).
 */
export function uploadToCloudinaryDirect(
  file: Blob,
  filename: string,
  sig: CloudinarySignature,
  onProgress?: (percent: number) => void,
): Promise<CloudinaryUploadResult> {
  const attempt = (attemptNumber: number): Promise<CloudinaryUploadResult> =>
    new Promise((resolve, reject) => {
      const retry = (fallback: () => void) => {
        if (attemptNumber >= MAX_UPLOAD_ATTEMPTS - 1) {
          fallback();
          return;
        }
        // Progress resets to 0 on the retried attempt — same as any other
        // upload starting fresh, and the ring reading the callback already
        // handles any percentage.
        onProgress?.(0);
        setTimeout(
          () => attempt(attemptNumber + 1).then(resolve, reject),
          UPLOAD_RETRY_BASE_DELAY_MS * 2 ** attemptNumber,
        );
      };

      const form = new FormData();
      form.append("file", file, filename);
      form.append("api_key", sig.api_key);
      form.append("timestamp", String(sig.timestamp));
      form.append("signature", sig.signature);
      form.append("folder", sig.folder);

      const xhr = new XMLHttpRequest();
      xhr.open("POST", sig.upload_url);
      // Generous — a 150MB video on slow mobile data genuinely can take a
      // while, and this leg has none of the platform ceilings the old
      // through-our-own-servers path did, so there's no reason to be strict.
      xhr.timeout = 5 * 60 * 1000;

      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable && onProgress) onProgress(Math.round((e.loaded / e.total) * 100));
      };
      xhr.onload = () => {
        let body: { error?: { message?: string } } & Partial<CloudinaryUploadResult> = {};
        try {
          body = JSON.parse(xhr.responseText);
        } catch {
          /* fall through to the status-based branch below */
        }
        if (xhr.status >= 200 && xhr.status < 300 && body.secure_url) {
          resolve(body as CloudinaryUploadResult);
        } else {
          // body.error?.message is Cloudinary's own validation reason
          // ("Invalid image file", "File size too large") — genuinely
          // useful for the person who just picked that exact file, so it's
          // shown as-is. The raw status code isn't: logged for debugging,
          // never shown — a bare "(500)"/"(413)" means nothing to a real
          // user and just exposes that Cloudinary specifically is involved.
          if (!body.error?.message) console.error(`Cloudinary upload failed with status ${xhr.status}`);
          const message = body.error?.message || "The upload didn't go through — please try again.";
          if (isRetryableStatus(xhr.status)) retry(() => reject(new CloudinaryUploadError(message)));
          else reject(new CloudinaryUploadError(message));
        }
      };
      xhr.onerror = () => retry(() => reject(new CloudinaryUploadError("Network error while uploading")));
      xhr.ontimeout = () => retry(() => reject(new CloudinaryUploadError("Upload timed out")));
      xhr.send(form);
    });

  return attempt(0);
}
