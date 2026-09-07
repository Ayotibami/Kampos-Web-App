"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { TextInput } from "@/components/ui/TextInput";
import { ConfirmReasonModal } from "@/components/ui/FeedbackModal";
import { Search } from "@/components/ui/icons";
import { apiErrorMessage } from "@/lib/api";
import { friendlyDateTime } from "@/lib/format";
import { PROFILE_TYPE_PATH } from "@/lib/profileEditFields";
import { useReferenceStore } from "@/stores/referenceStore";
import { useProfilesAdminStore, type KreatorProfileRow } from "@/stores/profilesAdminStore";
import type { ProfileAdminFilters } from "@/lib/profilesAdminQuery";
import type { AdminProfileStatus } from "@/lib/serverProfilesAdmin";
import { ProfileRowCard } from "./ProfileRowCard";
import { PAGE_SIZE, SEARCH_DEBOUNCE_MS, STATUS_OPTIONS, VERIFIED_OPTIONS, selectClass, buildFields } from "./shared";

/**
 * Kreator tab of /villagepeople/profiles — search + status/verified filters
 * plus a campus dropdown (the only extra filter this type has). Same
 * cursor-based infinite scroll as StudentProfilesTab — see that file's own
 * doc comment for the full "why cursor, not offset" reasoning.
 *
 * `campus_tag`/`created_at` below are read defensively against the raw DB
 * column spellings (`campustag`/`joined_at`, confirmed in kreators/repo.ts)
 * since no admin search controller exists yet to confirm which spelling the
 * new endpoint actually returns — see serverProfilesAdmin.ts's own doc
 * comment on KreatorProfileRow for the full explanation.
 *
 * Edit navigates to the full-page editor
 * (/villagepeople/profiles/[type]/[avitag]) rather than opening a modal —
 * see that page's own doc comment for why it replaced ProfileEditModal.
 */
export function KreatorProfilesTab({
  initialRows,
  onFail,
  onSucceed,
}: {
  initialRows: KreatorProfileRow[];
  onFail: (msg: string) => void;
  onSucceed: (msg: string) => void;
}) {
  const router = useRouter();
  const [rows, setRows] = useState<KreatorProfileRow[]>(initialRows);
  const [searchInput, setSearchInput] = useState("");
  const [status, setStatus] = useState<AdminProfileStatus | "">("");
  const [verified, setVerified] = useState<"" | "true" | "false">("");
  const [campusTag, setCampusTag] = useState("");
  const [searching, setSearching] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [exhausted, setExhausted] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<KreatorProfileRow | null>(null);
  const [banTarget, setBanTarget] = useState<KreatorProfileRow | null>(null);
  const [busyAvitag, setBusyAvitag] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<"verify" | "ban" | "delete" | null>(null);

  const campuses = useReferenceStore((s) => s.campuses);
  const fetchCampuses = useReferenceStore((s) => s.fetchCampuses);
  const fetchKreators = useProfilesAdminStore((s) => s.fetchKreators);
  const verifyProfile = useProfilesAdminStore((s) => s.verifyProfile);
  const unverifyProfile = useProfilesAdminStore((s) => s.unverifyProfile);
  const banProfile = useProfilesAdminStore((s) => s.banProfile);
  const unbanProfile = useProfilesAdminStore((s) => s.unbanProfile);
  const deleteProfile = useProfilesAdminStore((s) => s.deleteProfile);

  useEffect(() => {
    fetchCampuses().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const currentFilters = (): ProfileAdminFilters => ({
    search: searchInput.trim() || undefined,
    profile_status: status || undefined,
    is_verified: verified || undefined,
    campus_tag: campusTag || undefined,
  });

  const runSearch = async (filters: ProfileAdminFilters) => {
    setSearching(true);
    try {
      const results = await fetchKreators({ ...filters, limit: PAGE_SIZE });
      setRows(results);
      setExhausted(false);
    } catch (err) {
      onFail(apiErrorMessage(err, "Failed to load kreator profiles"));
    } finally {
      setSearching(false);
    }
  };

  const loadMore = useCallback(async () => {
    if (loadingMore || searching || exhausted || rows.length === 0) return;
    const cursor = rows[rows.length - 1]?.avitag;
    if (!cursor) return;
    setLoadingMore(true);
    try {
      const more = await fetchKreators({ ...currentFilters(), cursor, limit: PAGE_SIZE });
      if (more.length) setRows((prev) => [...prev, ...more]);
      else setExhausted(true);
    } catch (err) {
      onFail(apiErrorMessage(err, "Failed to load more kreator profiles"));
    } finally {
      setLoadingMore(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadingMore, searching, exhausted, rows, fetchKreators, status, verified, campusTag]);

  const sentinelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) void loadMore();
      },
      { rootMargin: "600px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [loadMore]);

  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      void runSearch(currentFilters());
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(debounceRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput]);

  const handleFilterChange = (
    next: Partial<{ status: AdminProfileStatus | ""; verified: "" | "true" | "false"; campus: string }>,
  ) => {
    const filters: ProfileAdminFilters = {
      search: searchInput.trim() || undefined,
      profile_status: (next.status ?? status) || undefined,
      is_verified: (next.verified ?? verified) || undefined,
      campus_tag: (next.campus ?? campusTag) || undefined,
    };
    if (next.status !== undefined) setStatus(next.status);
    if (next.verified !== undefined) setVerified(next.verified);
    if (next.campus !== undefined) setCampusTag(next.campus);
    void runSearch(filters);
  };

  const handleVerify = async (row: KreatorProfileRow) => {
    const nextVerified = !row.is_verified;
    setBusyAvitag(row.avitag);
    setBusyAction("verify");
    try {
      if (nextVerified) await verifyProfile("kreator", row.avitag);
      else await unverifyProfile("kreator", row.avitag);
      setRows((prev) => prev.map((r) => (r.avitag === row.avitag ? { ...r, is_verified: nextVerified } : r)));
      onSucceed(`@${row.avitag} is now ${nextVerified ? "verified" : "unverified"}.`);
    } catch (err) {
      onFail(apiErrorMessage(err, `Failed to ${nextVerified ? "verify" : "unverify"} profile`));
    } finally {
      setBusyAvitag(null);
      setBusyAction(null);
    }
  };

  const handleDelete = async (reason?: string) => {
    if (!deleteTarget) return;
    setBusyAvitag(deleteTarget.avitag);
    setBusyAction("delete");
    try {
      await deleteProfile("kreator", deleteTarget.avitag, reason);
      setRows((prev) => prev.filter((r) => r.avitag !== deleteTarget.avitag));
      onSucceed(`@${deleteTarget.avitag}'s kreator profile was deleted.`);
      setDeleteTarget(null);
    } catch (err) {
      onFail(apiErrorMessage(err, "Failed to delete profile"));
    } finally {
      setBusyAvitag(null);
      setBusyAction(null);
    }
  };

  const handleToggleBan = async (row: KreatorProfileRow, reason?: string) => {
    const nextBanned = row.profile_status !== "BANNED";
    setBusyAvitag(row.avitag);
    setBusyAction("ban");
    try {
      if (nextBanned) await banProfile("kreator", row.avitag, reason);
      else await unbanProfile("kreator", row.avitag);
      setRows((prev) =>
        prev.map((r) => (r.avitag === row.avitag ? { ...r, profile_status: nextBanned ? "BANNED" : "ACTIVE" } : r)),
      );
      onSucceed(`@${row.avitag} is now ${nextBanned ? "banned" : "unbanned"}.`);
      setBanTarget(null);
    } catch (err) {
      onFail(apiErrorMessage(err, `Failed to ${nextBanned ? "ban" : "unban"} profile`));
    } finally {
      setBusyAvitag(null);
      setBusyAction(null);
    }
  };

  const fieldsFor = (row: KreatorProfileRow) =>
    buildFields([
      ["Email", row.email],
      ["Campus", row.campustag ?? row.campus_tag],
      ["Engagement score", row.engagement_score],
      ["Monetization", row.monetization_enabled, (v) => (v ? "Enabled" : "Disabled")],
      ["Joined", row.joined_at ?? row.created_at, (v) => friendlyDateTime(v as string)],
    ]);

  return (
    <div className="flex flex-col gap-4">
      <ConfirmReasonModal
        open={!!deleteTarget}
        onClose={() => (busyAction === "delete" ? undefined : setDeleteTarget(null))}
        onConfirm={handleDelete}
        title="Delete this kreator profile?"
        message={`@${deleteTarget?.avitag} and everything on this profile will be hidden for good. This can't be undone. You can add a reason for the record.`}
        confirmLabel="Delete"
        loading={busyAction === "delete"}
      />
      <ConfirmReasonModal
        open={!!banTarget}
        onClose={() => (busyAction === "ban" ? undefined : setBanTarget(null))}
        onConfirm={(reason) => banTarget && handleToggleBan(banTarget, reason)}
        title="Ban this kreator profile?"
        message={`@${banTarget?.avitag}'s profile will be hidden and unusable until an admin unbans it. You can add a reason for the record; it gets shown back to them.`}
        confirmLabel="Ban"
        loading={busyAction === "ban"}
      />
      <section className="flex flex-col gap-3 rounded-2xl border border-line/70 p-4">
        <TextInput
          value={searchInput}
          onChange={setSearchInput}
          placeholder="Search by name, avitag, or email"
          autoComplete="off"
          autoCapitalize="none"
          trailingIcon={<Search className="h-4 w-4 text-muted" />}
        />
        <div className="flex flex-wrap gap-3">
          <select
            value={status}
            onChange={(e) => handleFilterChange({ status: e.target.value as AdminProfileStatus | "" })}
            className={selectClass}
          >
            {STATUS_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          <select
            value={verified}
            onChange={(e) => handleFilterChange({ verified: e.target.value as "" | "true" | "false" })}
            className={selectClass}
          >
            {VERIFIED_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          <select
            value={campusTag}
            onChange={(e) => handleFilterChange({ campus: e.target.value })}
            className={selectClass}
          >
            <option value="">All campuses</option>
            {campuses.map((c) => (
              <option key={c.tag} value={c.tag}>
                {c.label}
              </option>
            ))}
          </select>
        </div>
      </section>

      {searching ? (
        <p className="rounded-2xl border border-dashed border-line/70 p-6 text-center font-nunito text-sm text-muted">
          Searching…
        </p>
      ) : rows.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-line/70 p-6 text-center font-nunito text-sm text-muted">
          No kreator profiles match this search.
        </p>
      ) : (
        <>
          <ul className="flex flex-col gap-3">
            {rows.map((row) => (
              <ProfileRowCard
                key={row.avitag}
                avatarSrc={row.image_url}
                displayName={row.display_name}
                avitag={row.avitag}
                verified={row.is_verified}
                status={row.profile_status}
                fields={fieldsFor(row)}
                busy={busyAvitag === row.avitag ? busyAction : null}
                onView={() => router.push(`/villagepeople/profiles/${PROFILE_TYPE_PATH.kreator}/${row.avitag}`)}
                onEdit={() => router.push(`/villagepeople/profiles/${PROFILE_TYPE_PATH.kreator}/${row.avitag}/edit`)}
                onVerify={() => handleVerify(row)}
                onBan={() => (row.profile_status === "BANNED" ? handleToggleBan(row) : setBanTarget(row))}
                onDelete={() => setDeleteTarget(row)}
              />
            ))}
          </ul>

          {!exhausted && <div ref={sentinelRef} aria-hidden className="h-1 w-full" />}
          {loadingMore && (
            <p className="py-3 text-center font-nunito text-xs text-muted">Loading more…</p>
          )}
          {exhausted && (
            <p className="py-3 text-center font-nunito text-xs text-faint">
              That&apos;s every kreator profile matching this search.
            </p>
          )}
        </>
      )}
    </div>
  );
}
