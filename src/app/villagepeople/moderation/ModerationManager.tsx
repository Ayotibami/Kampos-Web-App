"use client";

import { useState } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { SuccessModal, ErrorModal } from "@/components/ui/FeedbackModal";
import type { PendingGist, PendingProfile, PendingReport, PendingSpotReport } from "@/lib/serverModeration";
import { PendingPostsTab } from "./PendingPostsTab";
import { ReportsTab } from "./ReportsTab";
import { SpotReportsTab } from "./SpotReportsTab";
import { ProfileVerificationsTab } from "./ProfileVerificationsTab";

type TabKey = "posts" | "reports" | "spot-reports" | "profiles";

const TABS: { key: TabKey; label: string }[] = [
  { key: "posts", label: "Pending Posts" },
  { key: "reports", label: "Reports" },
  { key: "spot-reports", label: "Spot Reports" },
  { key: "profiles", label: "Profile Verifications" },
];

function isTabKey(v: string | null): v is TabKey {
  return v === "posts" || v === "reports" || v === "spot-reports" || v === "profiles";
}

/**
 * Client half of /villagepeople/moderation — owns the three-tab switcher
 * plus the ONE shared pair of success/error feedback modals all three tabs
 * report through (via `onFail`/`onSucceed` props), same pattern
 * AdminsManager.tsx uses for its own grant/revoke flows. Sharing them here
 * rather than each tab owning its own pair avoids tripling that
 * boilerplate for three screens that all report outcomes the same way.
 *
 * Each tab keeps its OWN list state (initialized from this page's one
 * server-side fetch) and mutates it locally on success — there is no
 * shared "moderation list" state here, since a Pending Posts action never
 * needs to affect the Reports or Profile Verifications lists (or vice
 * versa), and switching tabs never re-fetches.
 */
export function ModerationManager({
  initialGists,
  initialReports,
  initialSpotReports,
  initialProfiles,
}: {
  initialGists: PendingGist[];
  initialReports: PendingReport[];
  initialSpotReports: PendingSpotReport[];
  initialProfiles: PendingProfile[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const tabParam = searchParams.get("tab");
  const [tab, setTabState] = useState<TabKey>(isTabKey(tabParam) ? tabParam : "posts");

  // The URL reflects the active tab (not just component state) so it's
  // shareable/bookmarkable and, critically, so HQ's own "Pending gists" /
  // "Pending reports" cards can link straight to the right tab instead of
  // always landing on Pending Posts regardless of which card was clicked.
  // `replace` (not `push`) — switching tabs isn't a new page in the user's
  // sense, so it shouldn't pile up back-button history entries.
  const setTab = (next: TabKey) => {
    setTabState(next);
    router.replace(`${pathname}?tab=${next}`, { scroll: false });
  };

  // Live counts for the tab badges — each tab reports its OWN current
  // count back up (via onCountChange, called on mount and after every
  // approve/reject/etc.), since ModerationManager itself owns no shared
  // list state (see this file's own doc comment on why). Seeded from the
  // initial server-fetched arrays so the very first render already shows
  // real numbers, not a flash of zero before each tab mounts.
  const [counts, setCounts] = useState<Record<TabKey, number>>({
    posts: initialGists.length,
    reports: initialReports.length,
    "spot-reports": initialSpotReports.length,
    profiles: initialProfiles.length,
  });

  const [errorMessage, setErrorMessage] = useState<string>();
  const [showError, setShowError] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string>();
  const [showSuccess, setShowSuccess] = useState(false);

  const fail = (msg: string) => {
    setErrorMessage(msg);
    setShowError(true);
  };
  const succeed = (msg: string) => {
    setSuccessMessage(msg);
    setShowSuccess(true);
  };

  return (
    <>
      <SuccessModal open={showSuccess} onClose={() => setShowSuccess(false)} message={successMessage} />
      <ErrorModal open={showError} onClose={() => setShowError(false)} message={errorMessage} />

      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-6 py-10 md:px-10">
        <div>
          <h1 className="font-nunito text-2xl font-extrabold text-ink">Moderation</h1>
          <p className="mt-1 font-nunito text-sm text-muted">
            Review pending posts, reports, and profile verifications.
          </p>
        </div>

        <div className="flex flex-wrap gap-2 border-b border-line/70 pb-3">
          {TABS.map((t) => {
            const active = tab === t.key;
            const count = counts[t.key];
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => setTab(t.key)}
                className={`flex items-center gap-2 rounded-full px-4 py-2 font-nunito text-sm font-semibold transition ${
                  active ? "bg-brand text-white" : "text-muted hover:bg-brand/5 hover:text-brand"
                }`}
              >
                {t.label}
                {count > 0 && (
                  <span
                    className={`rounded-full px-1.5 py-0.5 text-xs font-bold ${
                      active ? "bg-white/25 text-white" : "bg-brand/10 text-brand"
                    }`}
                  >
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {tab === "posts" && (
          <PendingPostsTab
            initialGists={initialGists}
            onFail={fail}
            onSucceed={succeed}
            onCountChange={(n) => setCounts((c) => ({ ...c, posts: n }))}
          />
        )}
        {tab === "reports" && (
          <ReportsTab
            initialReports={initialReports}
            onFail={fail}
            onSucceed={succeed}
            onCountChange={(n) => setCounts((c) => ({ ...c, reports: n }))}
          />
        )}
        {tab === "spot-reports" && (
          <SpotReportsTab
            initialReports={initialSpotReports}
            onFail={fail}
            onSucceed={succeed}
            onCountChange={(n) => setCounts((c) => ({ ...c, "spot-reports": n }))}
          />
        )}
        {tab === "profiles" && (
          <ProfileVerificationsTab
            initialProfiles={initialProfiles}
            onFail={fail}
            onSucceed={succeed}
            onCountChange={(n) => setCounts((c) => ({ ...c, profiles: n }))}
          />
        )}
      </div>
    </>
  );
}
