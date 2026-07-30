// A file's declared `.type` is just a label the browser derived from the
// extension/OS — trivially wrong if someone renames anything.exe to
// anything.jpg. This does a real (if lightweight) check: read the first few
// bytes and confirm they match the magic-byte signature real files of that
// format actually start with, rather than trusting the label alone.

export const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"] as const;
export const ALLOWED_VIDEO_TYPES = ["video/mp4", "video/webm", "video/quicktime"] as const;
export const ALLOWED_MEDIA_TYPES = [...ALLOWED_IMAGE_TYPES, ...ALLOWED_VIDEO_TYPES] as const;
export type AllowedMediaType = (typeof ALLOWED_MEDIA_TYPES)[number];

// Split by type rather than one flat cap — a real phone photo is a few MB;
// giving images the same headroom as video just invites slow uploads on
// mobile data for no real benefit. 50MB of video comfortably covers well
// over a minute at typical mobile bitrates (a 1-min clip at 4-6Mbps runs
// ~30-45MB), with room to spare.
export const MAX_IMAGE_BYTES = 15 * 1024 * 1024;
export const MAX_VIDEO_BYTES = 50 * 1024 * 1024;

export function maxBytesFor(type: AllowedMediaType): number {
  return (ALLOWED_IMAGE_TYPES as readonly string[]).includes(type) ? MAX_IMAGE_BYTES : MAX_VIDEO_BYTES;
}

type SignatureFamily = "jpeg" | "png" | "gif" | "webp" | "webm" | "isobmff";

// mp4 and mov (quicktime) are both ISO base media file format containers —
// they share the same "ftyp" box signature, so we can't tell them apart by
// magic bytes alone without parsing the brand. Treating them as one family
// is enough to catch a spoofed non-video file; it just can't tell mp4 from
// mov, which isn't a security distinction worth the extra parsing.
const EXPECTED_FAMILY: Record<AllowedMediaType, SignatureFamily> = {
  "image/jpeg": "jpeg",
  "image/png": "png",
  "image/gif": "gif",
  "image/webp": "webp",
  "video/mp4": "isobmff",
  "video/webm": "webm",
  "video/quicktime": "isobmff",
};

function bytesMatch(view: Uint8Array, offset: number, expected: number[]): boolean {
  if (view.length < offset + expected.length) return false;
  for (let i = 0; i < expected.length; i++) {
    if (view[offset + i] !== expected[i]) return false;
  }
  return true;
}

async function sniffSignatureFamily(file: File): Promise<SignatureFamily | null> {
  const head = new Uint8Array(await file.slice(0, 16).arrayBuffer());

  if (bytesMatch(head, 0, [0xff, 0xd8, 0xff])) return "jpeg";
  if (bytesMatch(head, 0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "png";
  if (bytesMatch(head, 0, [0x47, 0x49, 0x46, 0x38])) return "gif";
  if (bytesMatch(head, 0, [0x52, 0x49, 0x46, 0x46]) && bytesMatch(head, 8, [0x57, 0x45, 0x42, 0x50])) return "webp";
  if (bytesMatch(head, 0, [0x1a, 0x45, 0xdf, 0xa3])) return "webm";
  if (bytesMatch(head, 4, [0x66, 0x74, 0x79, 0x70])) return "isobmff"; // 'ftyp'

  return null;
}

export function isAllowedMediaType(type: string): type is AllowedMediaType {
  return (ALLOWED_MEDIA_TYPES as readonly string[]).includes(type);
}

/** True only if the declared MIME type is on the allowlist AND the file's
 * actual bytes match what that format is supposed to look like. */
export async function isGenuineMedia(file: File): Promise<boolean> {
  if (!isAllowedMediaType(file.type)) return false;
  const family = await sniffSignatureFamily(file);
  return family === EXPECTED_FAMILY[file.type];
}
