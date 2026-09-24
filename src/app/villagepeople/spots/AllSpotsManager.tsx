"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AdminSpotCard } from "@/components/villagepeople/AdminSpotCard";
import { TextInput } from "@/components/ui/TextInput";
import { ErrorModal } from "@/components/ui/FeedbackModal";
import { Search } from "@/components/ui/icons";
import { apiErrorMessage } from "@/lib/api";
import { useAllSpotsStore } from "@/stores/allSpotsStore";
import type { AdminSpot, AdminSpotFilters, AdminSpotStatus } from "@/lib/serverSpotsAdmin";

const PAGE_SIZE = 30;
const SEARCH_DEBOUNCE_MS = 400;

const STATUS_OPTIONS: { value: AdminSpotStatus | ""; label: string }[] = [
  { value: "", label: "All statuses" },
  { value: "ACTIVE", label: "Active" },
  { value: "REJECTED", label: "Taken down" },
  { value: "REMOVED", label: "Removed by poster" },
  { value: "DRAFT", label: "Draft (stuck uploads)" },
];

/**
 * Client half of /villagepeople/spots — the filter bar (status/search) plus
 * the infinite-scrolling list below it. Mirrors AllGistsManager.tsx's own
 * split/pagination shape exactly (cursor = the last-seen spot's own
 * spot_id, `exhausted` flips true only once a fetch actually comes back
 * empty), just without the comment-panel machinery — Spot moderation
 * doesn't currently need an admin comment view, so this stays a plain list.
 */
export function AllSpotsManager({
  initialSpots,
  initialTotal,
  avitag,
  embedded = false,
  emptyMessage,
}: {
  initialSpots: AdminSpot[];
  initialTotal?: number;
  /** When set, scopes every fetch to just this one avitag's own Spots —
   * used by the profile-view page's own Spots section. The search filter is
   * hidden in this mode (redundant once already scoped to one person); the
   * status filter stays. */
  avitag?: string;
  /** True when embedded inside another page (the profile-view page) rather
   * than being the whole page itself — drops the outer page-width/padding
   * wrapper and the "All Spots" heading. */
  embedded?: boolean;
  emptyMessage?: string;
}) {
  const [spots, setSpots] = useState<AdminSpot[]>(initialSpots);
  const [total, setTotal] = useState<number | undefined>(initialTotal);
  const [status, setStatus] = useState<AdminSpotStatus | "">("");
  const [searchInput, setSearchInput] = useState("");
  const [searching, setSearching] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [exhausted, setExhausted] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string>();
  const [showError, setShowError] = useState(false);

  const fetchSpots = useAllSpotsStore((s) => s.fetchSpots);

  const fail = (msg: string) => {
    setErrorMessage(msg);
    setShowError(true);
  };

  const currentFilters = (): AdminSpotFilters => ({
    status: status || undefined,
    search: searchInput.trim() || undefined,
    avitag: avitag || undefined,
  });

  const runSearch = async (filters: AdminSpotFilters) => {
    setSearching(true);
    try {
      const result = await fetchSpots({ ...filters, limit: PAGE_SIZE });
      setSpots(result.spots);
      setTotal(result.total);
      setExhausted(false);
    } catch (err) {
      fail(apiErrorMessage(err, "Failed to load Spots"));
    } finally {
      setSearching(false);
    }
  };

  const loadMore = useCallback(async () => {
    if (loadingMore || searching || exhausted || spots.length === 0) return;
    const cursor = spots[spots.length - 1]?.spot_id;
    if (!cursor) return;
    setLoadingMore(true);
    try {
      const result = await fetchSpots({ ...currentFilters(), cursor, limit: PAGE_SIZE });
      if (result.spots.length) setSpots((prev) => [...prev, ...result.spots]);
      else setExhausted(true);
    } catch (err) {
      fail(apiErrorMessage(err, "Failed to load more Spots"));
    } finally {
      setLoadingMore(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadingMore, searching, exhausted, spots, fetchSpots, status, searchInput, avitag]);

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

  const handleStatusChange = (next: AdminSpotStatus | "") => {
    setStatus(next);
    void runSearch({
      status: next || undefined,
      search: searchInput.trim() || undefined,
      avitag: avitag || undefined,
    });
  };

  const handleChanged = (updated: AdminSpot) => {
    // If a status filter is active and this row's new status no longer
    // matches it (Take Down under an "Active" filter, Reactivate under a
    // "Taken down" filter, ...), remove it from view instead of leaving a
    // stale row sitting in a list it wouldn't appear in on a fresh fetch —
    // same "the list reflects what its own filter promises" reasoning
    // handleDeleted already gets for free from a hard delete.
    if (status && updated.status !== status) {
      setSpots((prev) => prev.filter((s) => s.spot_id !== updated.spot_id));
      setTotal((t) => (t !== undefined ? Math.max(0, t - 1) : t));
      return;
    }
    setSpots((prev) => prev.map((s) => (s.spot_id === updated.spot_id ? { ...s, ...updated } : s)));
  };

  const handleDeleted = (spotId: string) => {
    setSpots((prev) => prev.filter((s) => s.spot_id !== spotId));
    setTotal((t) => (t !== undefined ? Math.max(0, t - 1) : t));
  };

  return (
    <>
      <ErrorModal open={showError} onClose={() => setShowError(false)} message={errorMessage} />

      <div
        className={
          embedded
            ? "mx-auto flex w-full max-w-3xl flex-col gap-4 px-6 md:px-10"
            : "mx-auto flex w-full max-w-[1180px] flex-col gap-6 px-6 pt-10 md:px-10"
        }
      >
        {!embedded && (
          <div className="mx-auto w-full max-w-3xl">
            <h1 className="font-nunito text-2xl font-extrabold text-ink">All Spots</h1>
            <p className="mt-1 font-nunito text-sm text-muted">
              Browse every Spot on Kampos, regardless of status.
            </p>
          </div>
        )}

        <section className="mx-auto flex w-full max-w-3xl flex-col gap-3 rounded-2xl border border-line/70 p-4">
          {!avitag && (
            <TextInput
              value={searchInput}
              onChange={setSearchInput}
              placeholder="Search caption or @avitag"
              autoComplete="off"
              autoCapitalize="none"
              trailingIcon={<Search className="h-4 w-4 text-muted" />}
            />
          )}
          <select
            value={status}
            onChange={(e) => handleStatusChange(e.target.value as AdminSpotStatus | "")}
            className="w-full min-w-0 rounded-2xl border border-line bg-surface-2 px-4 py-2.5 font-nunito text-sm text-ink outline-none focus:border-brand sm:w-auto"
          >
            {STATUS_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </section>
      </div>

      <div className={`${embedded ? "mt-4" : "mt-6"} pb-10`}>
        <section className="flex min-w-0 flex-1 justify-center px-6 md:px-10">
          <div className="flex w-full max-w-3xl flex-col gap-2">
            {searching ? (
              <p className="rounded-2xl border border-dashed border-line/70 p-6 text-center font-nunito text-sm text-muted">
                Searching…
              </p>
            ) : spots.length === 0 ? (
              <p className="rounded-2xl border border-dashed border-line/70 p-6 text-center font-nunito text-sm text-muted">
                {emptyMessage ?? "No Spots match this search."}
              </p>
            ) : (
              <>
                {total !== undefined && (
                  <p className="font-nunito text-sm font-bold text-ink">
                    {total} {total === 1 ? "Spot" : "Spots"}
                  </p>
                )}
                <ul className="flex flex-col gap-3">
                  {spots.map((spot) => (
                    <li key={spot.spot_id}>
                      <AdminSpotCard spot={spot} onChanged={handleChanged} onDeleted={handleDeleted} />
                    </li>
                  ))}
                </ul>

                {!exhausted && <div ref={sentinelRef} aria-hidden className="h-1 w-full" />}

                {loadingMore && (
                  <p className="py-3 text-center font-nunito text-xs text-muted">Loading more…</p>
                )}
                {exhausted && (
                  <p className="py-3 text-center font-nunito text-xs text-faint">
                    That&apos;s every Spot matching this search.
                  </p>
                )}
              </>
            )}
          </div>
        </section>
      </div>
    </>
  );
}
