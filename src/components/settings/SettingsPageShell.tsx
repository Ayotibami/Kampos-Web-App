import type { ReactNode } from "react";
import { SettingsHeader } from "./SettingsHeader";

/**
 * Shared frame for every Settings page: back+title header, then a content
 * lane below it.
 *
 * Two widths:
 *  - default (forms — Profile/Account): capped to a comfortable reading
 *    width and centered, so text inputs don't stretch edge-to-edge inside
 *    the wide desktop content pane.
 *  - `wide` (row/link pages — Legal, Support): left-aligned under the
 *    header, no width cap at all — spans the full content pane. These
 *    pages are a handful of link cards, not a form; capping their width
 *    left them squeezed into a narrow column with dead space on either
 *    side, which also forced content to wrap taller than it needed to and
 *    scroll for no real reason.
 *
 * On mobile the default cap does nothing (the viewport is already narrower
 * than it), so this only changes desktop.
 */
export function SettingsPageShell({
  title,
  backHref,
  children,
  wide = false,
}: {
  title: string;
  backHref: string;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <SettingsHeader title={title} backHref={backHref} />
      {/* Scrolling and width-capping are two different jobs, deliberately
          split across two elements — putting both on the same one meant
          THIS box's own edge (the centered, ~max-w-xl-wide one) was what
          scrolled, so the scrollbar rendered floating in the middle of a
          wide desktop screen instead of flush against the actual page
          edge. The outer div owns the scroll and spans the full content
          pane; the inner one just centers/caps the content living inside
          an already-full-width scroll area. */}
      <div className="min-h-0 w-full flex-1 overflow-y-auto">
        <div className={`flex w-full flex-col px-6 pb-8 pt-6 ${wide ? "" : "mx-auto max-w-xl"}`}>{children}</div>
      </div>
    </div>
  );
}
