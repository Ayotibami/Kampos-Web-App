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
  const marker = "/upload/";
  const idx = url.indexOf(marker);
  if (!url.includes("res.cloudinary.com") || idx === -1) return url;
  const insertAt = idx + marker.length;
  return `${url.slice(0, insertAt)}c_fill,g_auto,ar_${aspectRatio}/${url.slice(insertAt)}`;
}

/** What the backend's `GET /gists/:id/media/signature` hands back — enough
 * for the browser to upload straight to Cloudinary itself afterward. */
export interface CloudinarySignature {
  signature: string;
  timestamp: number;
  api_key: string;
  cloud_name: string;
  folder: string;
  eager?: string;
  upload_url: string;
}

export interface CloudinaryUploadResult {
  secure_url: string;
  public_id: string;
  resource_type: "image" | "video";
  bytes: number;
  duration?: number;
  eager?: Array<{ secure_url: string }>;
}

/** A Cloudinary-shaped error response, distinct from a network failure —
 * lets callers show Cloudinary's own real reason ("File size too large",
 * "Invalid image file", etc.) instead of a made-up generic message. */
export class CloudinaryUploadError extends Error {}

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
  return new Promise((resolve, reject) => {
    const form = new FormData();
    form.append("file", file, filename);
    form.append("api_key", sig.api_key);
    form.append("timestamp", String(sig.timestamp));
    form.append("signature", sig.signature);
    form.append("folder", sig.folder);
    if (sig.eager) form.append("eager", sig.eager);

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
        reject(new CloudinaryUploadError(body.error?.message || `Cloudinary rejected the upload (${xhr.status})`));
      }
    };
    xhr.onerror = () => reject(new CloudinaryUploadError("Network error while uploading"));
    xhr.ontimeout = () => reject(new CloudinaryUploadError("Upload timed out"));
    xhr.send(form);
  });
}
