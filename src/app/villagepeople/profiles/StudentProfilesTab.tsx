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
import { useProfilesAdminStore, type StudentProfileRow } from "@/stores/profilesAdminStore";
import type { ProfileAdminFilters } from "@/lib/profilesAdminQuery";
import type { AdminProfileStatus } from "@/lib/serverProfilesAdmin";
import { ProfileRowCard } from "./ProfileRowCard";
import { PAGE_SIZE, SEARCH_DEBOUNCE_MS, STATUS_OPTIONS, VERIFIED_OPTIONS, LEVEL_OPTIONS, selectClass, buildFields } from "./shared";

/**
 * Student tab of /villagepeople/profiles — search + status/verified filters
 * plus campus/major/level (the only type with all three, since student is
 * the only profile with a major/level of its own). Infinite-scroll loading
 * is cursor-based (cursor = the last-seen row's own avitag), copied from
 * AllGistsManager.tsx's exact mechanism — NOT UsersManager's offset
 * heuristic, since this list can shrink as an admin deletes/verifies rows
 * out from under it (see this task's own reasoning for why the offset
 * heuristic is the wrong fit here).
 *
 * Edit navigates to the full-page editor
 * (/villagepeople/profiles/[type]/[avitag]) rather than opening a modal —
 * see that page's own doc comment for why it replaced ProfileEditModal.
 * The list doesn't try to optimistically patch a row after an edit;
 * coming back here from that page just shows whatever this tab's next
 * natural re-fetch/re-search reflects. Verify/delete are unrelated actions
 * (profilesAdminStore.verifyProfile/deleteProfile) still handled locally.
 */
export function StudentProfilesTab({
  initialRows,
  onFail,
  onSucceed,
}: {
  initialRows: StudentProfileRow[];
  onFail: (msg: string) => void;
  onSucceed: (msg: string) => void;
}) {
  const router = useRouter();
  const [rows, setRows] = useState<StudentProfileRow[]>(initialRows);
  const [searchInput, setSearchInput] = useState("");
  const [status, setStatus] = useState<AdminProfileStatus | "">("");
  const [verified, setVerified] = useState<"" | "true" | "false">("");
  const [campusTag, setCampusTag] = useState("");
  const [majorTag, setMajorTag] = useState("");
  const [level, setLevel] = useState("");
  const [searching, setSearching] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [exhausted, setExhausted] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<StudentProfileRow | null>(null);
  const [banTarget, setBanTarget] = useState<StudentProfileRow | null>(null);
  const [busyAvitag, setBusyAvitag] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<"verify" | "ban" | "delete" | null>(null);

  const campuses = useReferenceStore((s) => s.campuses);
  const majors = useReferenceStore((s) => s.majors);
  const fetchCampuses = useReferenceStore((s) => s.fetchCampuses);
  const fetchMajors = useReferenceStore((s) => s.fetchMajors);
  const fetchStudents = useProfilesAdminStore((s) => s.fetchStudents);
  const verifyProfile = useProfilesAdminStore((s) => s.verifyProfile);
  const unverifyProfile = useProfilesAdminStore((s) => s.unverifyProfile);
  const banProfile = useProfilesAdminStore((s) => s.banProfile);
  const unbanProfile = useProfilesAdminStore((s) => s.unbanProfile);
  const deleteProfile = useProfilesAdminStore((s) => s.deleteProfile);

  useEffect(() => {
    fetchCampuses().catch(() => {});
    fetchMajors().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const currentFilters = (): ProfileAdminFilters => ({
    search: searchInput.trim() || undefined,
    profile_status: status || undefined,
    is_verified: verified || undefined,
    campus_tag: campusTag || undefined,
    major_tag: majorTag || undefined,
    level: level || undefined,
  });

  const runSearch = async (filters: ProfileAdminFilters) => {
    setSearching(true);
    try {
      const results = await fetchStudents({ ...filters, limit: PAGE_SIZE });
      setRows(results);
      setExhausted(false);
    } catch (err) {
      onFail(apiErrorMessage(err, "Failed to load student profiles"));
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
      const more = await fetchStudents({ ...currentFilters(), cursor, limit: PAGE_SIZE });
      if (more.length) setRows((prev) => [...prev, ...more]);
      else setExhausted(true);
    } catch (err) {
      onFail(apiErrorMessage(err, "Failed to load more student profiles"));
    } finally {
      setLoadingMore(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadingMore, searching, exhausted, rows, fetchStudents, status, verified, campusTag, majorTag, level]);

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
    next: Partial<{ status: AdminProfileStatus | ""; verified: "" | "true" | "false"; campus: string; major: string; level: string }>,
  ) => {
    const filters: ProfileAdminFilters = {
      search: searchInput.trim() || undefined,
      profile_status: (next.status ?? status) || undefined,
      is_verified: (next.verified ?? verified) || undefined,
      campus_tag: (next.campus ?? campusTag) || undefined,
      major_tag: (next.major ?? majorTag) || undefined,
      level: (next.level ?? level) || undefined,
    };
    if (next.status !== undefined) setStatus(next.status);
    if (next.verified !== undefined) setVerified(next.verified);
    if (next.campus !== undefined) setCampusTag(next.campus);
    if (next.major !== undefined) setMajorTag(next.major);
    if (next.level !== undefined) setLevel(next.level);
    void runSearch(filters);
  };

  const handleVerify = async (row: StudentProfileRow) => {
    const nextVerified = !row.is_verified;
    setBusyAvitag(row.avitag);
    setBusyAction("verify");
    try {
      if (nextVerified) await verifyProfile("student", row.avitag);
      else await unverifyProfile("student", row.avitag);
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
      await deleteProfile("student", deleteTarget.avitag, reason);
      setRows((prev) => prev.filter((r) => r.avitag !== deleteTarget.avitag));
      onSucceed(`@${deleteTarget.avitag}'s student profile was deleted.`);
      setDeleteTarget(null);
    } catch (err) {
      onFail(apiErrorMessage(err, "Failed to delete profile"));
    } finally {
      setBusyAvitag(null);
      setBusyAction(null);
    }
  };

  // One toggle for both directions — unban fires immediately (matching
  // handleVerify's own no-confirm precedent above), ban goes through
  // ConfirmReasonModal first (banTarget set by the row's onBan below).
  const handleToggleBan = async (row: StudentProfileRow, reason?: string) => {
    const nextBanned = row.profile_status !== "BANNED";
    setBusyAvitag(row.avitag);
    setBusyAction("ban");
    try {
      if (nextBanned) await banProfile("student", row.avitag, reason);
      else await unbanProfile("student", row.avitag);
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

  // Campus/major come back from the admin search API as bare tags
  // (e.g. "FUL", "bch") — same reference lists already fetched above for
  // this tab's own filter dropdowns give the full name, so look each one
  // up rather than adding a new backend join just for display. `campuses`
  // options already come pre-formatted as "Full Name (TAG)" (see
  // referenceStore.ts); majors don't, so that combination is built here.
  const fieldsFor = (row: StudentProfileRow) => {
    const campusOption = campuses.find((c) => c.tag === row.campus_tag);
    const majorOption = majors.find((m) => m.major_tag === row.major_tag);
    return buildFields([
      ["Email", row.email],
      ["Campus", campusOption?.label ?? row.campus_tag],
      [
        "Major",
        majorOption ? `${majorOption.major_name} (${majorOption.major_tag.toUpperCase()})` : row.major_tag,
      ],
      ["Level", row.level],
      ["Degree", row.degree],
      ["Bio", row.bio],
      ["Hobbies", row.hobbies, (v) => (v as string[]).join(", ")],
      ["Joined", row.created_at, (v) => friendlyDateTime(v as string)],
    ]);
  };

  return (
    <div className="flex flex-col gap-4">
      <ConfirmReasonModal
        open={!!deleteTarget}
        onClose={() => (busyAction === "delete" ? undefined : setDeleteTarget(null))}
        onConfirm={handleDelete}
        title="Delete this student profile?"
        message={`@${deleteTarget?.avitag} and everything on this profile will be hidden for good. This can't be undone. You can add a reason for the record.`}
        confirmLabel="Delete"
        loading={busyAction === "delete"}
      />
      <ConfirmReasonModal
        open={!!banTarget}
        onClose={() => (busyAction === "ban" ? undefined : setBanTarget(null))}
        onConfirm={(reason) => banTarget && handleToggleBan(banTarget, reason)}
        title="Ban this student profile?"
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
          <select
            value={majorTag}
            onChange={(e) => handleFilterChange({ major: e.target.value })}
            className={selectClass}
          >
            <option value="">All majors</option>
            {majors.map((m) => (
              <option key={m.major_tag} value={m.major_tag}>
                {m.major_name}
              </option>
            ))}
          </select>
          <select
            value={level}
            onChange={(e) => handleFilterChange({ level: e.target.value })}
            className={selectClass}
          >
            {LEVEL_OPTIONS.map((l) => (
              <option key={l || "all"} value={l}>
                {l ? `${l} level` : "All levels"}
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
          No student profiles match this search.
        </p>
      ) : (
        <>
          <ul className="flex flex-col gap-3">
            {rows.map((row) => (
              <ProfileRowCard
                key={row.avitag}
                avatarSrc={row.image_url}
                displayName={row.display_name || `${row.first_name} ${row.last_name}`.trim()}
                avitag={row.avitag}
                verified={row.is_verified}
                status={row.profile_status}
                fields={fieldsFor(row)}
                busy={busyAvitag === row.avitag ? busyAction : null}
                onView={() => router.push(`/villagepeople/profiles/${PROFILE_TYPE_PATH.student}/${row.avitag}`)}
                onEdit={() => router.push(`/villagepeople/profiles/${PROFILE_TYPE_PATH.student}/${row.avitag}/edit`)}
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
              That&apos;s every student profile matching this search.
            </p>
          )}
        </>
      )}
    </div>
  );
}
