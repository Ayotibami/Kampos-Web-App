"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { TextInput } from "@/components/ui/TextInput";
import { Linkify } from "@/components/ui/Linkify";
import { ErrorModal } from "@/components/ui/FeedbackModal";
import { Search } from "@/components/ui/icons";
import { apiErrorMessage } from "@/lib/api";
import { friendlyDateTime } from "@/lib/format";
import { AUDIT_ACTIONS, type AuditAction, type AuditLogRow } from "@/lib/auditActions";
import { useAuditStore } from "@/stores/auditStore";

const PAGE_SIZE = 30;
const SEARCH_DEBOUNCE_MS = 400;

/** Human label for each action — same set as AUDIT_ACTIONS, just phrased
 * as a sentence fragment ("Banned a profile") rather than a wire value.
 * Exported so HQ's own "recent activity" mini-feed (villagepeople/HqDashboard.tsx)
 * can render rows identically instead of re-deriving the same map. */
export const ACTION_LABEL: Record<AuditAction, string> = {
  PROFILE_VERIFY: "Verified a profile",
  PROFILE_REJECT: "Rejected a profile",
  PROFILE_BAN: "Banned a profile",
  PROFILE_UNBAN: "Unbanned a profile",
  PROFILE_DELETE: "Deleted a profile",
  PROFILE_CREATE: "Created a profile",
  GIST_APPROVE: "Approved a gist",
  GIST_REJECT: "Rejected a gist",
  REPORT_ACCEPT: "Accepted a report",
  REPORT_REJECT: "Rejected a report",
  ADMIN_GRANT: "Granted admin access",
  ADMIN_REVOKE: "Revoked admin access",
  GIST_DELETE: "Deleted a gist",
  COMMENT_DELETE: "Deleted a comment",
  USER_CREATE: "Created an account",
  USER_EMAIL_EDIT: "Edited an account's email",
  ACCOUNT_SUSPEND: "Suspended an account",
  ACCOUNT_UNSUSPEND: "Unsuspended an account",
  ACCOUNT_DELETE: "Deleted an account",
  ADMIN_EMAIL_SENT: "Sent an email",
  REFERENCE_CREATE: "Added a campus/major",
  REFERENCE_UPDATE: "Renamed a campus/major",
  REFERENCE_DELETE: "Removed a campus/major",
};

/** Restorative/creation actions read green, destructive ones red, purely
 * informational ones (reject/edit/email) the app's own brand blue — a
 * quick visual scan of "was this a takedown or a routine action" without
 * reading every row's full label. */
export const ACTION_COLOR: Record<AuditAction, string> = {
  PROFILE_VERIFY: "bg-success/15 text-success",
  PROFILE_UNBAN: "bg-success/15 text-success",
  PROFILE_CREATE: "bg-success/15 text-success",
  GIST_APPROVE: "bg-success/15 text-success",
  REPORT_ACCEPT: "bg-success/15 text-success",
  ADMIN_GRANT: "bg-success/15 text-success",
  USER_CREATE: "bg-success/15 text-success",
  ACCOUNT_UNSUSPEND: "bg-success/15 text-success",
  REFERENCE_CREATE: "bg-success/15 text-success",
  PROFILE_BAN: "bg-danger/15 text-danger",
  PROFILE_DELETE: "bg-danger/15 text-danger",
  GIST_DELETE: "bg-danger/15 text-danger",
  COMMENT_DELETE: "bg-danger/15 text-danger",
  ACCOUNT_SUSPEND: "bg-danger/15 text-danger",
  ACCOUNT_DELETE: "bg-danger/15 text-danger",
  ADMIN_REVOKE: "bg-danger/15 text-danger",
  REFERENCE_DELETE: "bg-danger/15 text-danger",
  PROFILE_REJECT: "bg-brand/10 text-brand",
  GIST_REJECT: "bg-brand/10 text-brand",
  REPORT_REJECT: "bg-brand/10 text-brand",
  USER_EMAIL_EDIT: "bg-brand/10 text-brand",
  ADMIN_EMAIL_SENT: "bg-brand/10 text-brand",
  REFERENCE_UPDATE: "bg-brand/10 text-brand",
};

const ACTION_OPTIONS: { value: AuditAction | ""; label: string }[] = [
  { value: "", label: "All actions" },
  ...AUDIT_ACTIONS.map((a) => ({ value: a, label: ACTION_LABEL[a] })),
];

/** "Today" / "Yesterday" / "Sep 4, 2026" — breaks the list into day
 * groups so a long, similar-looking run of rows (several bans in a row,
 * say) doesn't read as one undifferentiated wall; each row underneath a
 * header still shows its own exact time via friendlyDateTime, this is
 * purely the coarser grouping on top of that. Local time, matching every
 * other date this app shows. */
function dayLabel(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const startOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diffDays = Math.round((startOf(now) - startOf(d)) / 86_400_000);
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  return d.toLocaleDateString(undefined, {
    month: "long",
    day: "numeric",
    year: d.getFullYear() === now.getFullYear() ? undefined : "numeric",
  });
}

/** target_type + target_id together say what an action was done to.
 * Only ACCOUNT is linkable — a PROFILE row's target_id is just an avitag
 * with no record of which of the 5 profile tables it lives in (audit_logs
 * doesn't store profile_type), so linking it would mean guessing across 5
 * routes for what's ultimately a "nice to have", not a correctness need.
 * GIST links to the consumer-facing single-gist page, which exists and is
 * genuinely useful to jump to; COMMENT has nowhere sensible to link at all.
 *
 * The label itself is the real, human-readable thing the backend resolved
 * (target_email/target_gist_preview/target_comment_preview/
 * target_profile_name — see audit.repo.ts's own LEFT JOINs), not a generic
 * "account"/"gist" placeholder — a bare UUID or gist_id means nothing on
 * its own, which is exactly what made the first version of this screen
 * read as vague. Falls back to the raw target_id only for the (should be
 * rare) case where the enrichment lookup found nothing — e.g. the target
 * has since been hard-deleted, or a stale test row referencing an account
 * that's gone. Exported for HQ's own mini-feed re-use — see ACTION_LABEL's
 * doc comment just above. */
export function TargetCell({ row }: { row: AuditLogRow }) {
  if (row.target_type === "ACCOUNT") {
    return (
      <Link
        href={`/villagepeople/users/${row.target_id}`}
        className="font-nunito text-xs font-semibold text-brand hover:underline"
      >
        {row.target_email ?? `account ${row.target_id.slice(0, 8)}`}
      </Link>
    );
  }
  if (row.target_type === "GIST") {
    return (
      <a
        href={`/gist/${row.target_id}`}
        target="_blank"
        rel="noreferrer"
        className="font-nunito text-xs font-semibold text-brand hover:underline"
      >
        {row.target_gist_preview ? `"${row.target_gist_preview}"` : `gist ${row.target_id.slice(0, 8)}`}
      </a>
    );
  }
  if (row.target_type === "PROFILE") {
    return (
      <span className="font-nunito text-xs font-semibold text-ink">
        {row.target_profile_name ? `${row.target_profile_name} (@${row.target_id})` : `@${row.target_id}`}
      </span>
    );
  }
  if (row.target_type === "CAMPUS") {
    return (
      <span className="font-nunito text-xs font-semibold text-ink">
        {row.target_campus_name ?? row.reason ?? row.target_id} <span className="text-faint">({row.target_id})</span>
      </span>
    );
  }
  if (row.target_type === "MAJOR") {
    return (
      <span className="font-nunito text-xs font-semibold text-ink">
        {row.target_major_name ?? row.reason ?? row.target_id} <span className="text-faint">({row.target_id})</span>
      </span>
    );
  }
  return (
    <span className="font-nunito text-xs text-muted">
      {row.target_comment_preview ? (
        <>
          comment: &ldquo;<Linkify text={row.target_comment_preview} />&rdquo;
        </>
      ) : (
        `comment ${row.target_id.slice(0, 8)}`
      )}
    </span>
  );
}

/**
 * Client half of /villagepeople/audit (king-only, enforced server-side in
 * page.tsx) — same filter-bar + cursor-continuation shape every other
 * Group B/C list in this admin section already uses (UsersManager,
 * StudentProfilesTab), just cursor-based (the last row's own `id`) instead
 * of UsersManager's offset, since audit_logs.id is a real, tie-free,
 * strictly-increasing BIGSERIAL — a better cursor than created_at, which
 * can collide under a burst of admin actions in the same millisecond.
 */
export function AuditLogManager({ initialLogs }: { initialLogs: AuditLogRow[] }) {
  const [rows, setRows] = useState<AuditLogRow[]>(initialLogs);
  const [searchInput, setSearchInput] = useState("");
  const [action, setAction] = useState<AuditAction | "">("");
  const [searching, setSearching] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(initialLogs.length >= PAGE_SIZE);

  const [errorMessage, setErrorMessage] = useState<string>();
  const [showError, setShowError] = useState(false);

  const fetchLogs = useAuditStore((s) => s.fetchLogs);

  const fail = (msg: string) => {
    setErrorMessage(msg);
    setShowError(true);
  };

  // A fresh search — filter changed. Always starts with no cursor and
  // REPLACES the list, same as every other filter-driven list here.
  const runSearch = async (filters: { search?: string; action?: AuditAction | "" }) => {
    setSearching(true);
    try {
      const results = await fetchLogs({
        search: filters.search || undefined,
        action: filters.action || undefined,
        limit: PAGE_SIZE,
      });
      setRows(results);
      setHasMore(results.length >= PAGE_SIZE);
    } catch (err) {
      fail(apiErrorMessage(err, "Failed to search the activity log"));
    } finally {
      setSearching(false);
    }
  };

  // Re-entrancy guard for loadMore below — a plain ref, not the `loadingMore`
  // state. IntersectionObserver can fire its callback twice in the same
  // tick (e.g. right as the sentinel mounts, before the first call's
  // setLoadingMore(true) has actually committed and re-rendered) — since
  // React state updates aren't synchronous, both invocations can see the
  // OLD `loadingMore === false` and both pass the guard, firing two
  // concurrent fetches with the identical cursor. Both then append their
  // (overlapping) results, producing duplicate rows with duplicate `id`
  // keys — confirmed live via React's own "two children with the same
  // key" warning before this ref existed. A ref mutates immediately,
  // synchronously, with no render in between, so the second call sees the
  // real current value no matter how tightly the two calls land.
  const loadMoreInFlightRef = useRef(false);

  // Scroll-triggered continuation — cursor is the last row already on
  // screen's own id, so this only ever asks for rows OLDER than what's
  // shown, regardless of anything written since the page loaded.
  const loadMore = useCallback(async () => {
    if (loadMoreInFlightRef.current || searching || !hasMore || rows.length === 0) return;
    loadMoreInFlightRef.current = true;
    setLoadingMore(true);
    try {
      const results = await fetchLogs({
        search: searchInput.trim() || undefined,
        action: action || undefined,
        cursor: rows[rows.length - 1].id,
        limit: PAGE_SIZE,
      });
      // Defensive de-dupe on top of the ref guard above — belt and
      // braces, since a duplicate-key React warning is the kind of bug
      // that's silent until it isn't (a stale closure re-introduced, a
      // future edit removing the ref guard by accident).
      setRows((prev) => {
        const seen = new Set(prev.map((r) => r.id));
        return [...prev, ...results.filter((r) => !seen.has(r.id))];
      });
      setHasMore(results.length >= PAGE_SIZE);
    } catch (err) {
      fail(apiErrorMessage(err, "Failed to load more of the activity log"));
    } finally {
      loadMoreInFlightRef.current = false;
      setLoadingMore(false);
    }
  }, [searching, hasMore, rows, searchInput, action, fetchLogs]);

  // Same sentinel + rootMargin pattern as UsersManager.tsx's own list.
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

  // Debounced re-search on the free-text field only — the action dropdown
  // re-searches immediately (a discrete choice, nothing to debounce).
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      void runSearch({ search: searchInput, action });
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(debounceRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput]);

  const handleActionChange = (next: AuditAction | "") => {
    setAction(next);
    void runSearch({ search: searchInput, action: next });
  };

  return (
    <>
      <ErrorModal open={showError} onClose={() => setShowError(false)} message={errorMessage} />

      <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-6 py-10 md:px-10">
        <div>
          <h1 className="font-nunito text-2xl font-extrabold text-ink">Activity log</h1>
          <p className="mt-1 font-nunito text-sm text-muted">
            Every admin action, in order — who did what, to what, and why.
          </p>
        </div>

        <section className="flex flex-col gap-3 rounded-2xl border border-line/70 p-4">
          <TextInput
            value={searchInput}
            onChange={setSearchInput}
            placeholder="Search by admin or target"
            autoComplete="off"
            autoCapitalize="none"
            trailingIcon={<Search className="h-4 w-4 text-muted" />}
          />
          <select
            value={action}
            onChange={(e) => handleActionChange(e.target.value as AuditAction | "")}
            className="w-full min-w-0 rounded-2xl border border-line bg-surface-2 px-4 py-2.5 font-nunito text-sm text-ink outline-none focus:border-brand sm:w-auto"
          >
            {ACTION_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </section>

        <section className="flex flex-col gap-2">
          {searching ? (
            <p className="rounded-2xl border border-dashed border-line/70 p-6 text-center font-nunito text-sm text-muted">
              Searching…
            </p>
          ) : rows.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-line/70 p-6 text-center font-nunito text-sm text-muted">
              No activity matches this search.
            </p>
          ) : (
            <ul className="flex flex-col gap-5">
              {rows.map((row, i) => {
                const label = dayLabel(row.created_at);
                const showDayHeader = i === 0 || dayLabel(rows[i - 1].created_at) !== label;
                const time = new Date(row.created_at).toLocaleTimeString(undefined, {
                  hour: "numeric",
                  minute: "2-digit",
                });
                return (
                  <div key={row.id} className="flex flex-col gap-2">
                    {showDayHeader && (
                      <p className="font-nunito text-xs font-bold uppercase tracking-wide text-faint">{label}</p>
                    )}
                    <div className="flex flex-col gap-2 rounded-2xl border border-line/70 p-4 shadow-sm sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                      <div className="flex min-w-0 flex-1 items-start gap-3">
                        <span
                          className={`mt-0.5 shrink-0 rounded-full px-3 py-1 font-nunito text-xs font-bold ${ACTION_COLOR[row.action] ?? "bg-line/20 text-muted"}`}
                        >
                          {ACTION_LABEL[row.action] ?? row.action}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-nunito text-sm text-ink">
                            <TargetCell row={row} />
                          </p>
                          <p className="mt-0.5 font-nunito text-xs text-muted">
                            by <span className="font-semibold text-ink">{row.idiot_avitag}</span>
                          </p>
                          {row.reason && (
                            <p
                              className="mt-1.5 break-words rounded-lg bg-surface-2 px-2.5 py-1.5 font-nunito text-xs text-ink"
                              title={row.reason}
                            >
                              &ldquo;{row.reason}&rdquo;
                            </p>
                          )}
                        </div>
                      </div>
                      <span
                        className="shrink-0 font-nunito text-[11px] text-faint"
                        title={friendlyDateTime(row.created_at)}
                      >
                        {time}
                      </span>
                    </div>
                  </div>
                );
              })}
            </ul>
          )}

          {!searching && hasMore && <div ref={sentinelRef} className="h-px w-full" aria-hidden />}

          {loadingMore && <p className="py-3 text-center font-nunito text-xs text-muted">Loading more…</p>}
          {!searching && !loadingMore && !hasMore && rows.length > 0 && (
            <p className="py-3 text-center font-nunito text-xs text-faint">That&apos;s everything on record.</p>
          )}
        </section>
      </div>
    </>
  );
}
