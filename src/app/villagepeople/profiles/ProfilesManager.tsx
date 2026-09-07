"use client";

import { useState } from "react";
import { SuccessModal, ErrorModal } from "@/components/ui/FeedbackModal";
import type {
  StudentProfileRow,
  KreatorProfileRow,
  KompanyProfileRow,
  SchoolProfileRow,
  IdiotProfileRow,
} from "@/lib/serverProfilesAdmin";
import { StudentProfilesTab } from "./StudentProfilesTab";
import { KreatorProfilesTab } from "./KreatorProfilesTab";
import { KompanyProfilesTab } from "./KompanyProfilesTab";
import { SchoolProfilesTab } from "./SchoolProfilesTab";
import { IdiotProfilesTab } from "./IdiotProfilesTab";

type TabKey = "student" | "kreator" | "kompany" | "school" | "idiot";

const TABS: { key: TabKey; label: string }[] = [
  { key: "student", label: "Student" },
  { key: "kreator", label: "Kreator" },
  { key: "kompany", label: "Kompany" },
  { key: "school", label: "School" },
  { key: "idiot", label: "Idiot" },
];

/**
 * Client half of /villagepeople/profiles — owns the 5-tab switcher plus the
 * ONE shared pair of success/error feedback modals every tab reports
 * through (via `onFail`/`onSucceed` props), same pattern ModerationManager
 * uses for its own 3 tabs.
 *
 * Each tab keeps its OWN list state (initialized from this page's own
 * per-type server-side fetch) and mutates it locally on success — there is
 * no shared "all profiles" state here, since editing/verifying/deleting a
 * student profile never needs to affect the Kreator/Kompany/School/Idiot
 * tabs' own lists. Switching tabs never re-fetches — each tab already has
 * its initial page from the server, exactly like Moderation's own 3 tabs.
 */
export function ProfilesManager({
  initialStudents,
  initialKreators,
  initialKompanies,
  initialSchools,
  initialIdiots,
}: {
  initialStudents: StudentProfileRow[];
  initialKreators: KreatorProfileRow[];
  initialKompanies: KompanyProfileRow[];
  initialSchools: SchoolProfileRow[];
  initialIdiots: IdiotProfileRow[];
}) {
  const [tab, setTab] = useState<TabKey>("student");

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
          <h1 className="font-nunito text-2xl font-extrabold text-ink">Profiles</h1>
          <p className="mt-1 font-nunito text-sm text-muted">
            Browse, search, edit, and verify profiles by type.
          </p>
        </div>

        <div className="flex flex-wrap gap-2 border-b border-line/70 pb-3">
          {TABS.map((t) => {
            const active = tab === t.key;
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => setTab(t.key)}
                className={`rounded-full px-4 py-2 font-nunito text-sm font-semibold transition ${
                  active ? "bg-brand text-white" : "text-muted hover:bg-brand/5 hover:text-brand"
                }`}
              >
                {t.label}
              </button>
            );
          })}
        </div>

        {tab === "student" && (
          <StudentProfilesTab initialRows={initialStudents} onFail={fail} onSucceed={succeed} />
        )}
        {tab === "kreator" && (
          <KreatorProfilesTab initialRows={initialKreators} onFail={fail} onSucceed={succeed} />
        )}
        {tab === "kompany" && (
          <KompanyProfilesTab initialRows={initialKompanies} onFail={fail} onSucceed={succeed} />
        )}
        {tab === "school" && (
          <SchoolProfilesTab initialRows={initialSchools} onFail={fail} onSucceed={succeed} />
        )}
        {tab === "idiot" && (
          <IdiotProfilesTab initialRows={initialIdiots} onFail={fail} onSucceed={succeed} />
        )}
      </div>
    </>
  );
}
