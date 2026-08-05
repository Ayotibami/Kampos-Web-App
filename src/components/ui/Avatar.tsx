"use client";

import { useState } from "react";

/**
 * A profile image with a graceful degrade path, Twitter-style: no URL, or a
 * URL that fails to actually load (broken link, 404, CORS), both show a
 * plain grey circle rather than a placeholder illustration or the browser's
 * broken-image icon.
 */
export function Avatar({ src, className = "" }: { src?: string | null; className?: string }) {
  const [failed, setFailed] = useState(false);

  if (!src || failed) {
    return <div className={`h-full w-full bg-line/60 ${className}`} />;
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt="" className={`h-full w-full object-cover ${className}`} onError={() => setFailed(true)} />
  );
}
