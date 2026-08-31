"use client";

import Image from "next/image";
import { env } from "@/lib/env";
import { ExternalLinkIconFill } from "@/components/ui/icons";

/**
 * Link out to The Korner (a separate product, not this app) — sits inline
 * alongside the social icons in both the mobile Settings hub and the
 * desktop rail's footer (see their own call sites), not as its own
 * separately-captioned block — that cost an entire extra caption+gap of
 * vertical height, which on the desktop rail (a hard-viewport-height panel
 * with no scroll of its own) could push the footer's last items below the
 * visible area on a shorter window.
 *
 * Shown in Korner's own real brand color, same as the social icons next to
 * it now are — a muted-until-hover treatment was tried first (to avoid
 * competing with Kampos's own identical --color-brand blue) but that killed
 * any way to tell it's clickable on touch devices, where hover doesn't
 * exist. The small persistent external-link glyph is what actually signals
 * "this navigates elsewhere" now, so color is free to just be Korner's own
 * real brand mark instead of doing double duty as the only click affordance.
 */
export function KornerLink({ large = false }: { large?: boolean }) {
  const sizeClass = large ? "h-[18px]" : "h-4";
  return (
    <a
      href={env.KORNER_URL}
      target="_blank"
      rel="noreferrer"
      aria-label="Visit The Korner"
      className="flex items-center gap-1 rounded-lg px-2 py-1 transition hover:bg-brand/10"
    >
      <Image
        src="/brand/korner-logo-blue.webp"
        alt="The Korner"
        width={519}
        height={177}
        className={`block w-auto dark:hidden ${sizeClass}`}
      />
      <Image
        src="/brand/korner-logo-white.webp"
        alt="The Korner"
        width={519}
        height={177}
        className={`hidden w-auto dark:block ${sizeClass}`}
      />
      <ExternalLinkIconFill className="h-3 w-3 text-faint" weight="bold" />
    </a>
  );
}
