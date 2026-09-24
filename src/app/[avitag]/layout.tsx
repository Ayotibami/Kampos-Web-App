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
 */
export default function AvitagLayout({ children }: { children: ReactNode }) {
  return <Suspense fallback={<Loading />}>{children}</Suspense>;
}
