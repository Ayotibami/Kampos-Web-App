"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AccountInitialAvatar } from "@/components/villagepeople/AccountInitialAvatar";
import { Button } from "@/components/ui/Button";
import { TextInput } from "@/components/ui/TextInput";
import { ErrorModal } from "@/components/ui/FeedbackModal";
import { Search, Plus } from "@/components/ui/icons";
import { apiErrorMessage } from "@/lib/api";
import { friendlyDateTime } from "@/lib/format";
import { useUserManagementStore, type AccountSearchRow, type UserSearchFilters } from "@/stores/userManagementStore";
import { CreateAccountModal } from "./CreateAccountModal";

const PAGE_SIZE = 20;
const SEARCH_DEBOUNCE_MS = 400;

const ROLE_OPTIONS: { value: UserSearchFilters["role"] & string; label: string }[] = [
  { value: "", label: "All roles" },
  { value: "user", label: "User" },
  { value: "idiot", label: "Idiot" },
  { value: "king", label: "King" },
];

const STATUS_OPTIONS: { value: UserSearchFilters["account_status"] & string; label: string }[] = [
  { value: "", label: "All statuses" },
  { value: "ACTIVE", label: "Active" },
  { value: "DEACTIVATED", label: "Deactivated" },
  { value: "SUSPENDED", label: "Suspended" },
  { value: "DELETED", label: "Deleted" },
];

function statusColor(status?: string): string {
  if (status === "ACTIVE") return "text-success";
  if (status === "DEACTIVATED" || status === "SUSPENDED") return "text-warning";
  if (status === "DELETED") return "text-danger";
  return "text-muted";
}

function roleColor(role?: string): string {
  if (role === "king") return "bg-brand text-white";
  if (role === "idiot") return "bg-brand/10 text-brand";
  return "bg-line/20 text-muted";
}

/**
 * Client half of /villagepeople/users — owns the filter bar, results list,
 * infinite-scroll loading, and the "Create account" entry point. The server
 * page.tsx does the initial unfiltered fetch; every filter change or scroll
 * continuation from here on re-fetches through userManagementStore's
 * searchUsers (the shared `api` client), same split as
 * AdminsManager/ModerationManager.
 *
 * Loading pattern: auto-fetches the next batch as the list scrolls near its
 * end, via an IntersectionObserver sentinel — the exact same mechanism the
 * consumer-facing profile page already uses for its own gist list
 * (src/app/[avitag]/ProfileView.tsx's loadMoreGists/sentinelRef), not a
 * Previous/Next pager. Unlike the moderation queues (which shrink as an
 * admin works them, making a growing offset unsafe — see
 * moderationStore.ts's own comment), browsing/searching users doesn't
 * remove rows from the underlying set just by looking at them, so a plain
 * growing `offset` here is safe and correctly APPENDS each batch rather
 * than replacing the list (a filter change is the one case that resets and
 * replaces, same as starting a fresh search anywhere else in this app).
 *
 * `hasMore` is inferred from "got back a full page of rows" (length ===
 * PAGE_SIZE) since the written contract for GET /idiot/users never promised
 * a real `total`/`hasMore` field back — same heuristic every other
 * offset-only list in this admin section already uses.
 */
export function UsersManager({ initialRows }: { initialRows: AccountSearchRow[] }) {
  const [rows, setRows] = useState<AccountSearchRow[]>(initialRows);
  const [searchInput, setSearchInput] = useState("");
  const [role, setRole] = useState<UserSearchFilters["role"] & string>("");
  const [accountStatus, setAccountStatus] = useState<UserSearchFilters["account_status"] & string>("");
  const [noProfile, setNoProfile] = useState(false);
  const [searching, setSearching] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(initialRows.length >= PAGE_SIZE);
  const [createOpen, setCreateOpen] = useState(false);

  const [errorMessage, setErrorMessage] = useState<string>();
  const [showError, setShowError] = useState(false);

  const searchUsers = useUserManagementStore((s) => s.searchUsers);

  const fail = (msg: string) => {
    setErrorMessage(msg);
    setShowError(true);
  };

  const currentFilters = (): UserSearchFilters => ({
    search: searchInput.trim() || undefined,
    role: role || undefined,
    account_status: accountStatus || undefined,
    no_profile: noProfile || undefined,
  });

  // A fresh search — filter changed, or "load more" needs a first page to
  // continue from. Always starts at offset 0 and REPLACES the list.
  const runSearch = async (filters: UserSearchFilters) => {
    setSearching(true);
    try {
      const results = await searchUsers({ ...filters, limit: PAGE_SIZE, offset: 0 });
      setRows(results);
      setHasMore(results.length >= PAGE_SIZE);
    } catch (err) {
      fail(apiErrorMessage(err, "Failed to search users"));
    } finally {
      setSearching(false);
    }
  };

  // Scroll-triggered continuation — APPENDS the next batch using the
  // current row count as the offset. Safe here (unlike the moderation
  // queues) because browsing doesn't remove rows from the underlying set.
  const loadMore = useCallback(async () => {
    if (loadingMore || searching || !hasMore) return;
    setLoadingMore(true);
    try {
      const results = await searchUsers({ ...currentFilters(), limit: PAGE_SIZE, offset: rows.length });
      setRows((prev) => [...prev, ...results]);
      setHasMore(results.length >= PAGE_SIZE);
    } catch (err) {
      fail(apiErrorMessage(err, "Failed to load more users"));
    } finally {
      setLoadingMore(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadingMore, searching, hasMore, rows.length, searchUsers, role, accountStatus, noProfile]);

  // Same sentinel + rootMargin pattern as ProfileView.tsx's own gist list —
  // fires a bit before the sentinel is actually on screen so the next batch
  // is ready by the time anyone scrolls that far.
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

  // Debounced re-search on the free-text field only — the three dropdowns
  // below re-search immediately on change (a discrete choice, not
  // free-typed text, so there's nothing to debounce). Every filter change
  // starts a fresh search (replaces the list, resets hasMore).
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
    next: Partial<{
      role: UserSearchFilters["role"] & string;
      status: UserSearchFilters["account_status"] & string;
      noProfile: boolean;
    }>,
  ) => {
    const filters: UserSearchFilters = {
      search: searchInput.trim() || undefined,
      role: (next.role ?? role) || undefined,
      account_status: (next.status ?? accountStatus) || undefined,
      no_profile: (next.noProfile ?? noProfile) || undefined,
    };
    if (next.role !== undefined) setRole(next.role);
    if (next.status !== undefined) setAccountStatus(next.status);
    if (next.noProfile !== undefined) setNoProfile(next.noProfile);
    void runSearch(filters);
  };

  const handleCreated = (accountId?: string) => {
    setCreateOpen(false);
    // Re-run the current search so the newly-created account can show up
    // once it has a profile — most likely it won't yet (this endpoint only
    // creates the bare account, no profile), so nothing to splice in here.
    void runSearch(currentFilters());
    void accountId;
  };

  return (
    <>
      <ErrorModal open={showError} onClose={() => setShowError(false)} message={errorMessage} />
      <CreateAccountModal open={createOpen} onClose={() => setCreateOpen(false)} onCreated={handleCreated} />

      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-6 py-10 md:px-10">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="font-nunito text-2xl font-extrabold text-ink">Accounts</h1>
            <p className="mt-1 font-nunito text-sm text-muted">
              Browse and search every account and profile on Kampos.
            </p>
          </div>
          <Button fullWidth={false} onClick={() => setCreateOpen(true)} className="!px-5">
            <Plus className="h-4 w-4" />
            Create account
          </Button>
        </div>

        <section className="flex flex-col gap-3 rounded-2xl border border-line/70 p-4">
          <div className="flex flex-col gap-3 md:flex-row">
            <div className="flex-1">
              <TextInput
                value={searchInput}
                onChange={setSearchInput}
                placeholder="Search by email, avitag, or name"
                autoComplete="off"
                autoCapitalize="none"
                trailingIcon={<Search className="h-4 w-4 text-muted" />}
              />
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <select
              value={role}
              onChange={(e) => handleFilterChange({ role: e.target.value as UserSearchFilters["role"] & string })}
              className="w-full min-w-0 rounded-2xl border border-line bg-surface-2 px-4 py-2.5 font-nunito text-sm text-ink outline-none focus:border-brand sm:w-auto"
            >
              {ROLE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>

            <select
              value={accountStatus}
              onChange={(e) => handleFilterChange({ status: e.target.value as UserSearchFilters["account_status"] & string })}
              className="w-full min-w-0 rounded-2xl border border-line bg-surface-2 px-4 py-2.5 font-nunito text-sm text-ink outline-none focus:border-brand sm:w-auto"
            >
              {STATUS_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>

            <label className="flex items-center gap-2 rounded-2xl border border-line bg-surface-2 px-4 py-2.5 font-nunito text-sm text-ink">
              <input
                type="checkbox"
                checked={noProfile}
                onChange={(e) => handleFilterChange({ noProfile: e.target.checked })}
                className="h-4 w-4 accent-brand"
              />
              No profile yet
            </label>
          </div>
        </section>

        <section className="flex flex-col gap-2">
          {searching ? (
            <p className="rounded-2xl border border-dashed border-line/70 p-6 text-center font-nunito text-sm text-muted">
              Searching…
            </p>
          ) : rows.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-line/70 p-6 text-center font-nunito text-sm text-muted">
              No users match this search.
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {rows.map((row) => (
                <li key={row.account_id}>
                  <Link
                    href={`/villagepeople/users/${row.account_id}`}
                    className="flex items-center gap-3 rounded-2xl border border-line/70 p-4 transition hover:border-brand/40 hover:bg-brand/5"
                  >
                    <AccountInitialAvatar email={row.email} className="h-10 w-10 shrink-0 text-sm" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-nunito text-sm font-semibold text-ink">{row.email}</p>
                      <p className="truncate font-nunito text-xs text-muted">
                        {(row.profile_count ?? 0) === 1
                          ? "1 profile"
                          : `${row.profile_count ?? 0} profiles`}
                        {row.created_at && ` · Joined ${friendlyDateTime(row.created_at)}`}
                      </p>
                    </div>
                    <span
                      className={`hidden shrink-0 rounded-full px-2.5 py-0.5 font-nunito text-[11px] font-bold sm:inline-block ${roleColor(row.role)}`}
                    >
                      {row.role ?? "user"}
                    </span>
                    <span
                      className={`shrink-0 font-nunito text-[11px] font-semibold ${statusColor(row.account_status)}`}
                    >
                      {row.account_status ?? "—"}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}

          {/* Invisible sentinel the IntersectionObserver above watches —
              rootMargin fires loadMore a bit before this actually scrolls
              into view, same as ProfileView.tsx's own gist list. Skipped
              entirely once there's nothing more to fetch. */}
          {!searching && hasMore && (
            <div ref={sentinelRef} className="h-px w-full" aria-hidden />
          )}

          {loadingMore && (
            <p className="py-3 text-center font-nunito text-xs text-muted">Loading more…</p>
          )}
          {!searching && !loadingMore && !hasMore && rows.length > 0 && (
            <p className="py-3 text-center font-nunito text-xs text-faint">
              That&apos;s everyone matching this search.
            </p>
          )}
        </section>
      </div>
    </>
  );
}
