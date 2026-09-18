"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { AdminGistCard } from "@/components/villagepeople/AdminGistCard";
import { CommentPanel } from "@/components/comment/CommentPanel";
import { TextInput } from "@/components/ui/TextInput";
import { ErrorModal } from "@/components/ui/FeedbackModal";
import { Search, X } from "@/components/ui/icons";
import { apiErrorMessage } from "@/lib/api";
import { timeAgo } from "@/lib/format";
import { useIsMobile } from "@/lib/useIsMobile";
import { useReferenceStore } from "@/stores/referenceStore";
import { useAllGistsStore } from "@/stores/allGistsStore";
import type { AdminGist, AdminGistFilters, AdminGistStatus } from "@/lib/serverGistsAdmin";
import type { Gist } from "@/types";

// Same lazy-load reasoning as ProfileView.tsx's own CommentSheet import —
// pulls the mobile bottom-sheet (+ its composer) out of this page's main
// chunk since it's only ever needed after a real tap.
const CommentSheet = dynamic(
  () => import("@/components/comment/CommentSheet").then((m) => m.CommentSheet),
  { ssr: false },
);

/**
 * CommentPanel/CommentSheet/the comment button they're driven by all expect
 * the consumer-facing `Gist` shape, not `AdminGist` — this admin screen
 * never needs anything beyond what they actually read internally
 * (gist_id, avitag, gist_text, created_at, media, counts.comments_count),
 * so a full field-for-field AdminGist -> Gist conversion isn't needed, just
 * enough of a stand-in for those specific reads.
 */
function toGistShape(g: AdminGist): Gist {
  return {
    gist_id: g.gist_id,
    avitag: g.avitag,
    gist_text: g.gist_text,
    created_at: g.created_at,
    image_url: g.image_url,
    media: g.media,
    counts: {
      reactions_count: g.reactions_count ?? 0,
      comments_count: g.comments_count ?? 0,
      views_count: g.views_count ?? 0,
      reports_count: g.reports_count ?? 0,
      shares_count: g.shares_count ?? 0,
      reactions_by_type: g.reactions_by_type,
    },
  };
}

/** Same "what am I commenting on" context strip as ProfileView.tsx's own
 * ActiveGistStrip — sits above CommentPanel (desktop only; CommentSheet
 * already shows its own gist context on mobile) so the panel stays legible
 * once several different gists have scrolled past on the left. */
function ActiveGistStrip({ gist, onClose }: { gist: Gist | undefined; onClose: () => void }) {
  if (!gist) return null;
  const text = gist.gist_text?.trim();
  const preview = text
    ? text.length > 90
      ? `${text.slice(0, 90).trimEnd()}…`
      : text
    : gist.media?.[0]?.media_type?.toLowerCase().includes("video")
      ? "Video"
      : gist.media?.length
        ? "Photo"
        : "";
  return (
    <div className="flex shrink-0 items-start justify-between gap-3 border-b border-line bg-brand/[0.06] px-5 py-3">
      <div className="min-w-0">
        <p className="font-nunito text-[10px] font-bold uppercase tracking-wide text-brand">Commenting on</p>
        <p className="mt-0.5 line-clamp-2 break-words font-nunito text-xs text-ink">{preview}</p>
        <p className="mt-0.5 font-nunito text-[11px] text-faint">{timeAgo(gist.created_at)}</p>
      </div>
      <button
        type="button"
        onClick={onClose}
        aria-label="Close comments"
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-muted transition hover:bg-black/5"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

const PAGE_SIZE = 30;
const SEARCH_DEBOUNCE_MS = 400;

const STATUS_OPTIONS: { value: AdminGistStatus | ""; label: string }[] = [
  { value: "", label: "All statuses" },
  { value: "SUBMITTED", label: "Submitted" },
  { value: "APPROVED", label: "Approved" },
  { value: "REJECTED", label: "Rejected" },
];

/**
 * Client half of /villagepeople/gists — the filter bar (status/search/
 * campus) plus the infinite-scrolling list below it. Owns the gist list in
 * local state, same "server does the initial fetch, this component owns
 * every filter change/scroll continuation from here on" split as
 * UsersManager/ModerationManager.
 *
 * Loading pattern is copied from the consumer app's OWN profile page gist
 * list — src/app/[avitag]/ProfileView.tsx's loadMoreGists/sentinelRef/
 * IntersectionObserver — not UsersManager's own offset-based infinite
 * scroll: cursor = the last-seen gist's own gist_id (not an offset number),
 * `exhausted` flips true only once a fetch actually comes back empty
 * (never inferred from "got back a full page", which is what UsersManager
 * has to do instead since GET /idiot/users never promised a real cursor).
 * This endpoint's written contract DOES provide a real cursor, so there's
 * no reason to fall back to that offset heuristic here.
 */
export function AllGistsManager({
  initialGists,
  avitag,
  embedded = false,
  emptyMessage,
}: {
  initialGists: AdminGist[];
  /** When set, scopes every fetch (initial load, filter changes, infinite
   * scroll) to just this one avitag's own gists — used by the profile-view
   * page's own gists section to show one person's post history instead of
   * the whole platform's. The search/campus filter controls are hidden in
   * this mode (redundant once already scoped to one person); the status
   * filter stays, since e.g. seeing only this profile's REJECTED gists is
   * still useful for moderation. */
  avitag?: string;
  /** True when this is embedded inside another page (the profile-view
   * page) rather than being the whole page itself — drops the outer
   * page-width/padding wrapper and the "All Gists" heading, since the
   * parent page already supplies both. */
  embedded?: boolean;
  emptyMessage?: string;
}) {
  const [gists, setGists] = useState<AdminGist[]>(initialGists);
  const [status, setStatus] = useState<AdminGistStatus | "">("");
  const [searchInput, setSearchInput] = useState("");
  const [campusTag, setCampusTag] = useState("");
  const [searching, setSearching] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  // Starts false regardless of initialGists.length, exactly like
  // ProfileView.tsx's own `exhausted` — the empty-list case is handled by
  // a completely separate render branch below (gists.length === 0), not by
  // pre-guessing exhausted from the initial page size.
  const [exhausted, setExhausted] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string>();
  const [showError, setShowError] = useState(false);

  // Comment viewing — same split as ProfileView.tsx's own: desktop gets a
  // sticky right-hand panel (CommentPanel), mobile gets a bottom sheet
  // (CommentSheet), both driven by which single gist is "active" rather
  // than each card owning its own panel state.
  const isMobile = useIsMobile();
  const [activeGistId, setActiveGistId] = useState<string | null>(null);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [showCommentSheet, setShowCommentSheet] = useState(false);
  const cardRefs = useRef<Map<string, HTMLLIElement>>(new Map());

  // Same "scrollspy" as ProfileView.tsx's own gist list: while the desktop
  // panel is open, it should keep following whichever card is centered on
  // screen as you scroll, not just stay frozen on whichever one you first
  // clicked. `rootMargin: "-50% 0px -50% 0px"` shrinks the observer's root
  // to a single line across the exact vertical middle of the viewport, so
  // `isIntersecting` only flips true for whichever card is crossing that
  // line right now. Desktop-only — on mobile, comments open in a one-off
  // sheet, not a persistent panel, so there's nothing for scrolling behind
  // it to silently swap.
  useEffect(() => {
    if (isMobile) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            const id = entry.target.getAttribute("data-gist-id");
            if (id) setActiveGistId(id);
          }
        }
      },
      { rootMargin: "-50% 0px -50% 0px" },
    );
    cardRefs.current.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [gists, isMobile]);

  const activeGist = gists.find((g) => g.gist_id === activeGistId);
  const activeGistShaped = activeGist ? toGistShape(activeGist) : undefined;

  const handleToggleComments = (gistId: string) => {
    setActiveGistId(gistId);
    if (isMobile) {
      setShowCommentSheet(true);
      return;
    }
    if (commentsOpen && activeGistId === gistId) {
      setCommentsOpen(false);
    } else {
      setCommentsOpen(true);
    }
  };

  const campuses = useReferenceStore((s) => s.campuses);
  const fetchCampuses = useReferenceStore((s) => s.fetchCampuses);
  const fetchGists = useAllGistsStore((s) => s.fetchGists);

  useEffect(() => {
    fetchCampuses().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fail = (msg: string) => {
    setErrorMessage(msg);
    setShowError(true);
  };

  const currentFilters = (): AdminGistFilters => ({
    status: status || undefined,
    search: searchInput.trim() || undefined,
    campus_tag: campusTag || undefined,
    avitag: avitag || undefined,
  });

  // A fresh search — filter changed. Always starts from no cursor and
  // REPLACES the list, same as UsersManager's own runSearch.
  const runSearch = async (filters: AdminGistFilters) => {
    setSearching(true);
    try {
      const results = await fetchGists({ ...filters, limit: PAGE_SIZE });
      setGists(results);
      setExhausted(false);
    } catch (err) {
      fail(apiErrorMessage(err, "Failed to load gists"));
    } finally {
      setSearching(false);
    }
  };

  // Scroll-triggered continuation — cursor = the last-seen gist's own id,
  // copied straight from ProfileView.tsx's loadMoreGists (see this
  // component's own doc comment for why that pattern, not UsersManager's
  // offset one, is the right fit here).
  const loadMore = useCallback(async () => {
    if (loadingMore || searching || exhausted || gists.length === 0) return;
    const cursor = gists[gists.length - 1]?.gist_id;
    if (!cursor) return;
    setLoadingMore(true);
    try {
      const more = await fetchGists({ ...currentFilters(), cursor, limit: PAGE_SIZE });
      if (more.length) setGists((prev) => [...prev, ...more]);
      else setExhausted(true);
    } catch (err) {
      fail(apiErrorMessage(err, "Failed to load more gists"));
    } finally {
      setLoadingMore(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadingMore, searching, exhausted, gists, fetchGists, status, searchInput, campusTag, avitag]);

  // Same sentinel + rootMargin pattern as ProfileView.tsx's own gist list —
  // fires a bit before the sentinel is actually on screen so the next page
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

  // Debounced re-search on the free-text field only — the two dropdowns
  // below re-search immediately on change, same split as UsersManager.
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      void runSearch(currentFilters());
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(debounceRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput]);

  const handleDropdownChange = (next: Partial<{ status: AdminGistStatus | ""; campus: string }>) => {
    const filters: AdminGistFilters = {
      status: (next.status ?? status) || undefined,
      search: searchInput.trim() || undefined,
      campus_tag: (next.campus ?? campusTag) || undefined,
    };
    if (next.status !== undefined) setStatus(next.status);
    if (next.campus !== undefined) setCampusTag(next.campus);
    void runSearch(filters);
  };

  const handleChanged = (updated: AdminGist) => {
    setGists((prev) => prev.map((g) => (g.gist_id === updated.gist_id ? { ...g, ...updated } : g)));
  };
  const handleDeleted = (gistId: string) => {
    setGists((prev) => prev.filter((g) => g.gist_id !== gistId));
    // The panel/sheet would otherwise keep showing comments for a gist that
    // no longer exists — same "close it if its own gist just went away"
    // reasoning ProfileView.tsx's handleGistDeleted follows.
    if (activeGistId === gistId) {
      setActiveGistId(null);
      setCommentsOpen(false);
      setShowCommentSheet(false);
    }
  };

  return (
    <>
      <ErrorModal open={showError} onClose={() => setShowError(false)} message={errorMessage} />

      {/* Heading + filter bar — centered/capped, same as before. Deliberately
          NOT a shared wrapper with the gist-list+comment-panel section below:
          that section needs to reach the TRUE viewport edge (see its own
          comment), which a shared cap on everything would prevent — same
          split ProfileView.tsx's own header-vs-gist-list uses. */}
      <div
        className={
          embedded
            ? "mx-auto flex w-full max-w-3xl flex-col gap-4 px-6 md:px-10"
            : "mx-auto flex w-full max-w-[1180px] flex-col gap-6 px-6 pt-10 md:px-10"
        }
      >
        {!embedded && (
          <div className="mx-auto w-full max-w-3xl">
            <h1 className="font-nunito text-2xl font-extrabold text-ink">All Gists</h1>
            <p className="mt-1 font-nunito text-sm text-muted">
              Browse every gist on Kampos, regardless of status.
            </p>
          </div>
        )}

        <section className="mx-auto flex w-full max-w-3xl flex-col gap-3 rounded-2xl border border-line/70 p-4">
          {!avitag && (
            <TextInput
              value={searchInput}
              onChange={setSearchInput}
              placeholder="Search gist text or @avitag"
              autoComplete="off"
              autoCapitalize="none"
              trailingIcon={<Search className="h-4 w-4 text-muted" />}
            />
          )}
          <div className="flex flex-wrap gap-3">
            <select
              value={status}
              onChange={(e) => handleDropdownChange({ status: e.target.value as AdminGistStatus | "" })}
              className="w-full min-w-0 rounded-2xl border border-line bg-surface-2 px-4 py-2.5 font-nunito text-sm text-ink outline-none focus:border-brand sm:w-auto"
            >
              {STATUS_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>

            {!avitag && (
              <select
                value={campusTag}
                onChange={(e) => handleDropdownChange({ campus: e.target.value })}
                className="w-full min-w-0 rounded-2xl border border-line bg-surface-2 px-4 py-2.5 font-nunito text-sm text-ink outline-none focus:border-brand sm:w-auto"
              >
                <option value="">All campuses</option>
                {campuses.map((c) => (
                  <option key={c.tag} value={c.tag}>
                    {c.label}
                  </option>
                ))}
              </select>
            )}
          </div>
        </section>
      </div>

      {/* Two columns on desktop once comments are open — gists on the left
          (its own inner max-w-3xl + padding, so cards don't stretch
          edge-to-edge), a sticky comment panel on the right that touches the
          TRUE right edge of the viewport when open, exactly like
          ProfileView.tsx's own gist list — this row is a full-width SIBLING
          of the capped section above, not nested inside it, which is what
          makes that possible. Closed by default so browsing doesn't
          permanently give up 360px of width; the left column reclaims the
          full width the moment it closes. */}
      <div className={`${embedded ? "mt-4" : "mt-6"} pb-10 md:flex md:items-stretch`}>
        <section className="flex min-w-0 flex-1 justify-center px-6 md:px-10">
          <div className="flex w-full max-w-3xl flex-col gap-2">
            {searching ? (
              <p className="rounded-2xl border border-dashed border-line/70 p-6 text-center font-nunito text-sm text-muted">
                Searching…
              </p>
            ) : gists.length === 0 ? (
              <p className="rounded-2xl border border-dashed border-line/70 p-6 text-center font-nunito text-sm text-muted">
                {emptyMessage ?? "No gists match this search."}
              </p>
            ) : (
              <>
                <ul className="flex flex-col gap-3">
                  {gists.map((gist) => (
                    <li
                      key={gist.gist_id}
                      data-gist-id={gist.gist_id}
                      ref={(el) => {
                        if (el) cardRefs.current.set(gist.gist_id, el);
                        else cardRefs.current.delete(gist.gist_id);
                      }}
                    >
                      <AdminGistCard
                        gist={gist}
                        active={commentsOpen && gist.gist_id === activeGistId}
                        onToggleComments={() => handleToggleComments(gist.gist_id)}
                        onChanged={handleChanged}
                        onDeleted={handleDeleted}
                      />
                    </li>
                  ))}
                </ul>

                {/* Invisible trigger for the next page — see the
                    IntersectionObserver effect above. Not shown once
                    exhausted, so there's nothing left to ever re-trigger it. */}
                {!exhausted && <div ref={sentinelRef} aria-hidden className="h-1 w-full" />}

                {loadingMore && (
                  <p className="py-3 text-center font-nunito text-xs text-muted">Loading more…</p>
                )}
                {exhausted && (
                  <p className="py-3 text-center font-nunito text-xs text-faint">
                    That&apos;s every gist matching this search.
                  </p>
                )}
              </>
            )}
          </div>
        </section>

        {commentsOpen && !searching && gists.length > 0 && (
          <div className="hidden md:block md:w-[360px] md:shrink-0">
            {/* Same sticky-panel sizing story as ProfileView.tsx's own —
                see its comment for exactly why h-[calc(100dvh-<header>)]
                rather than h-dvh; this page's own AppShell header height
                differs, so 100dvh (no floating header to subtract here)
                is correct as-is. */}
            <div className="sticky top-0 flex h-dvh flex-col bg-surface">
              <ActiveGistStrip gist={activeGistShaped} onClose={() => setCommentsOpen(false)} />
              <div className="min-h-0 flex-1">
                <CommentPanel gist={activeGistShaped} />
              </div>
            </div>
          </div>
        )}
      </div>

      <CommentSheet
        open={showCommentSheet}
        onClose={() => setShowCommentSheet(false)}
        gist={activeGistShaped}
        autoFocusInput={false}
      />
    </>
  );
}
