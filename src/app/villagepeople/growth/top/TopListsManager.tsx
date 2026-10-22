"use client";

import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import Link from "next/link";
import { getTopPosts, getTopUsers, apiErrorMessage, type TopPost, type TopUser } from "@/lib/growthApi";
import { computeRange, type DateRange } from "@/lib/growthRange";
import { GrowthControls, type GrowthControlsValue } from "@/components/villagepeople/GrowthControls";
import { TopListIconFill, EngagementIconFill } from "@/components/ui/icons";
import { timeAgo } from "@/lib/format";

export function TopListsManager() {
  const [controls, setControls] = useState<GrowthControlsValue>({
    rangeKey: "30d",
    customFrom: "",
    customTo: "",
    compare: false,
    campusTags: [],
  });
  const range: DateRange = useMemo(
    () => computeRange(controls.rangeKey, { from: controls.customFrom, to: controls.customTo }),
    [controls.rangeKey, controls.customFrom, controls.customTo]
  );
  const [posts, setPosts] = useState<TopPost[]>([]);
  const [users, setUsers] = useState<TopUser[]>([]);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadGenRef = useRef(0);
  const load = useCallback(() => {
    const gen = ++loadGenRef.current;
    setLoading(true);
    setError(null);
    Promise.all([getTopPosts(range), getTopUsers(range)])
      .then(([p, u]) => {
        if (gen !== loadGenRef.current) return;
        setPosts(p);
        setUsers(u);
        setLastUpdated(new Date().toISOString());
      })
      .catch((err) => {
        if (gen !== loadGenRef.current) return;
        setError(apiErrorMessage(err, "Couldn't load top posts/users"));
      })
      .finally(() => {
        if (gen === loadGenRef.current) setLoading(false);
      });
  }, [range]);

  // Deferred via setTimeout — see GrowthDashboardClient.tsx's own doc
  // comment on why (keeps this off react-hooks/set-state-in-effect).
  useEffect(() => {
    const timer = setTimeout(load, 0);
    return () => clearTimeout(timer);
  }, [load]);

  const campusFilteredPosts =
    controls.campusTags.length > 0 ? posts.filter((p) => p.campusTag && controls.campusTags.includes(p.campusTag)) : posts;
  const campusFilteredUsers =
    controls.campusTags.length > 0 ? users.filter((u) => u.campusTag && controls.campusTags.includes(u.campusTag)) : users;

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-6 py-10 md:px-10">
      <div>
        <h1 className="flex items-center gap-2 font-nunito text-2xl font-extrabold text-ink">
          <TopListIconFill className="h-6 w-6 text-brand" weight="fill" />
          Top posts &amp; users
        </h1>
        <p className="mt-1 font-nunito text-sm text-muted">
          Top 10 gists by likes+comments+reposts, and top 10 avitags by posts+comments, within the range below.
        </p>
      </div>

      <GrowthControls
        value={controls}
        onChange={setControls}
        lastUpdated={lastUpdated}
        onRefresh={load}
        showCompare={false}
        campusFilterHint="Filters these lists client-side (this endpoint doesn't take a campus param)."
      />

      {error && (
        <p className="rounded-2xl border border-dashed border-danger/40 bg-danger/5 p-4 text-center font-nunito text-sm text-danger">
          {error}
        </p>
      )}

      <section>
        <h2 className="mb-3 font-nunito text-sm font-bold text-ink">Top posts</h2>
        {campusFilteredPosts.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-line/70 p-6 text-center font-nunito text-sm text-muted">None yet.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {campusFilteredPosts.map((p, i) => (
              <li key={p.gistId} className="flex items-start gap-3 rounded-2xl border border-line/70 p-3.5">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand/10 font-nunito text-xs font-extrabold text-brand">
                  {i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-nunito text-sm text-ink">{p.preview}</p>
                  <p className="mt-0.5 font-nunito text-[11px] text-faint">
                    {p.authorName ?? p.avitag} {p.campusTag ? `· ${p.campusTag}` : ""} · {timeAgo(p.createdAt)}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1 rounded-full bg-line/15 px-2.5 py-1 font-nunito text-[11px] font-bold text-ink">
                  <EngagementIconFill className="h-3 w-3 text-brand" weight="fill" />
                  {p.total.toLocaleString()}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="mb-3 font-nunito text-sm font-bold text-ink">Top users</h2>
        {campusFilteredUsers.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-line/70 p-6 text-center font-nunito text-sm text-muted">None yet.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {campusFilteredUsers.map((u, i) => (
              <li key={u.avitag} className="flex items-center gap-3 rounded-2xl border border-line/70 p-3.5">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand/10 font-nunito text-xs font-extrabold text-brand">
                  {i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <Link href={`/${u.avitag}`} className="truncate font-nunito text-sm font-semibold text-ink hover:text-brand">
                    {u.authorName ?? u.avitag}
                  </Link>
                  <p className="mt-0.5 font-nunito text-[11px] text-faint">
                    @{u.avitag} {u.campusTag ? `· ${u.campusTag}` : ""} · {u.posts} posts, {u.comments} comments
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1 rounded-full bg-line/15 px-2.5 py-1 font-nunito text-[11px] font-bold text-ink">
                  {u.total.toLocaleString()}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {loading && <p className="text-center font-nunito text-xs text-faint">Loading…</p>}
    </div>
  );
}
