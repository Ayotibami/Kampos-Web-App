"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "@/components/ui/icons";
import { runGuardedNavigation } from "@/stores/unsavedChangesStore";

/**
 * Back-arrow + title header shared by Settings and every one of its
 * subpages. The arrow only renders on mobile (single-screen-at-a-time
 * navigation, same as StepScaffold's header) — on desktop the persistent
 * side rail (SettingsRail) is the navigation, so there's nothing to "go
 * back" from; the title alone still orients you within the content pane.
 *
 * Routed through runGuardedNavigation rather than a plain Link click —
 * this is the mobile back-out point for any page that might have unsaved
 * changes (Profile Settings), so it can't just navigate unconditionally.
 */
export function SettingsHeader({ title, backHref }: { title: string; backHref: string }) {
  const router = useRouter();
  return (
    <div className="flex shrink-0 items-center gap-3 px-6 pt-6 md:px-8 md:pt-8">
      <Link
        href={backHref}
        aria-label="Go back"
        onClick={(e) => {
          e.preventDefault();
          // replace, not push — this always lands on a known parent route
          // (safe even if someone opened this page directly, e.g. a
          // bookmark, with no real "back" to return to), but a *push* here
          // was quietly growing the history stack every time: Profile →
          // Settings → back landed you on Profile again looking fine, but
          // left a duplicate Profile entry sitting right behind Settings.
          // Profile's own back button falls back to a real router.back()
          // when it has no fresher route to jump to, so it popped into
          // that duplicate and bounced straight back to Settings instead
          // of reaching Feed — a Profile/Settings loop that only replace
          // (updates the current entry instead of adding a new one)
          // actually fixes.
          runGuardedNavigation(() => router.replace(backHref));
        }}
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-muted transition hover:bg-brand/10 hover:text-brand md:hidden"
      >
        <ArrowLeft className="h-5 w-5" />
      </Link>
      <h1 className="font-nunito text-lg font-extrabold text-ink">{title}</h1>
    </div>
  );
}
