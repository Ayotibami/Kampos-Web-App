import type { ReactNode } from "react";
import { Suspense } from "react";
import Loading from "./loading";

/**
 * Same fix as feed/layout.tsx, same reasoning — see its own comment. A
 * profile is the single most common client-side navigation target in the
 * app (the "You" tab, any avatar/handle tap, a grid cell), so this is
 * exactly the route where the sibling-navigation loading.tsx quirk was
 * most visible: tapping into a profile from anywhere else used to show
 * nothing (or the root's generic skeleton) instead of this page's own
 * pixel-matched one.
 *
 * Unlike loading.tsx (no params, ever), a layout DOES get its segment's
 * params — so this is also where the profile snapshot fast-path (see
 * profileSnapshotStore.ts) plugs in: passing avitag down lets Loading
 * check for a fresh snapshot and, when one exists, skip the skeleton and
 * render the real profile immediately as the Suspense fallback itself.
 */
export default async function AvitagLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ avitag: string }>;
}) {
  const { avitag } = await params;
  return <Suspense fallback={<Loading avitag={avitag} />}>{children}</Suspense>;
}
