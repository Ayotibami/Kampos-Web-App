"use client";

import { MediaImage } from "./MediaFrame";

/**
 * A profile image with a graceful degrade path, Twitter-style: no URL, a URL
 * that's still loading, or a URL that fails to actually load (broken link,
 * 404, CORS) — all show a plain grey circle rather than a blank flash, a
 * placeholder illustration, or the browser's broken-image icon.
 */
export function Avatar({ src, className = "" }: { src?: string | null; className?: string }) {
  return <MediaImage src={src} alt="" className={`h-full w-full object-cover ${className}`} />;
}
