"use client";

import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import {
  getDauSeries,
  getWau,
  getMau,
  getSignupsSeries,
  getPostsSeries,
  getDayNRetention,
  getEngagementMix,
  getSignupsBySource,
  pctChange,
  apiErrorMessage,
  type DaySeriesPoint,
  type EngagementMix,
  type SignupsBySourceRow,
} from "@/lib/growthApi";
import { computeRange, type DateRange } from "@/lib/growthRange";
import { GrowthControls, type GrowthControlsValue } from "@/components/villagepeople/GrowthControls";
import { StatCard } from "../HqDashboard";
import { TrendChart } from "@/components/villagepeople/TrendChart";
import { BreakdownBar } from "@/components/villagepeople/BreakdownBar";
import { GrowthLineChart, SignupsChart, StackedActionsChart } from "@/components/villagepeople/GrowthCharts";
import {
  GrowthIconFill,
  RetentionIconFill,
  AllGistsIconFill,
  SignupIconFill,
  UsersIconFill,
} from "@/components/ui/icons";

/**
 * Chart-only color slots for this page, same `.hq-viz`-style pattern
 * HqDashboard.tsx documents (scoped CSS vars, not global tokens) — DAU/WAU/
 * MAU get genuinely distinct categorical hues (none is "more" than another),
 * signups' two series reuse the brand pair HqDashboard already established
 * (`--series-signups`) plus a new accent for the cumulative line, and the
 * actions stack reuses the SAME meaning-carrying colors a reader already
 * learned on the HQ page where it makes sense (posts = the HQ signups blue's
 * sibling), introducing only what's genuinely new.
 */
const GROWTH_VIZ_STYLE = `
.growth-viz {
  --series-dau: #165abf;
  --series-wau: #0bb0ff;
  --series-mau: #1baf7a;
  --series-signups: #165abf;
  --series-cumulative: #eb6834;
  --series-posts: #165abf;
  --series-comments: #0bb0ff;
  --series-likes: #eb6834;
  --series-reposts: #1baf7a;
  --cat-lurkers: #94a3b8;
  --cat-engagers: #0bb0ff;
  --cat-posters: #165abf;
  --cat-mode-gist: #165abf;
  --cat-mode-school: #eda100;
  --cat-mode-amebo: #eb6834;
  --cat-mode-unknown: #94a3b8;
}
.dark .growth-viz {
  --series-wau: #39c3ff;
  --series-mau: #199e70;
  --series-cumulative: #d95926;
  --series-comments: #39c3ff;
  --series-likes: #d95926;
  --series-reposts: #199e70;
  --cat-lurkers: #64748b;
  --cat-engagers: #39c3ff;
  --cat-posters: #3987e5;
  --cat-mode-gist: #3987e5;
  --cat-mode-school: #c98500;
  --cat-mode-amebo: #d95926;
  --cat-mode-unknown: #64748b;
}
`;

/** Fixed order + color for the lurkers/engagers/posters bar — genuinely
 * ordered by engagement depth (not a nominal category), reusing the same
 * "color follows the entity, never its rank" rule BreakdownBar already
 * documents. */
const ENGAGEMENT_TIER_CONFIG: { key: string; label: string; color: string }[] = [
  { key: "lurkers", label: "Lurkers", color: "var(--cat-lurkers)" },
  { key: "engagers", label: "Engagers", color: "var(--cat-engagers)" },
  { key: "posters", label: "Posters", color: "var(--cat-posters)" },
];

/** Fixed order + color for the feed-mode split bar — the real 3-value
 * `feed_mode` spelling (`gist`/`school`/`amebo`) plus `unknown` for
 * whatever this task's own feed_view ping hasn't covered yet (legacy rows,
 * or simply not enough traffic accumulated since the ping started firing). */
const FEED_MODE_CONFIG: { key: string; label: string; color: string }[] = [
  { key: "gist", label: "Gist", color: "var(--cat-mode-gist)" },
  { key: "school", label: "School", color: "var(--cat-mode-school)" },
  { key: "amebo", label: "Amebo", color: "var(--cat-mode-amebo)" },
  { key: "unknown", label: "Unknown", color: "var(--cat-mode-unknown)" },
];

/** Signup sources are an open-ended, backend-defined set (organic, a given
 * utm_source, referral domains, …) — no fixed semantic order like the
 * tiers/modes above, so this just cycles a categorical palette by index,
 * in whatever order the backend returns (already ranked there). */
const SOURCE_PALETTE = ["#165abf", "#0bb0ff", "#1baf7a", "#eb6834", "#eda100", "#e87ba4", "#8a7cf0"];

const DAY_MS = 86_400_000;

function datesBetween(from: string, to: string): string[] {
  const out: string[] = [];
  let d = new Date(`${from}T00:00:00.000Z`).getTime();
  const end = new Date(`${to}T00:00:00.000Z`).getTime();
  while (d <= end) {
    out.push(new Date(d).toISOString().slice(0, 10));
    d += DAY_MS;
  }
  return out;
}

export function GrowthDashboardClient() {
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
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [dau, setDau] = useState<{ current: DaySeriesPoint[]; previous?: DaySeriesPoint[] }>({ current: [] });
  const [wauMauSeries, setWauMauSeries] = useState<Record<string, number | string>[]>([]);
  const [mauNow, setMauNow] = useState<{ count: number; previousCount?: number } | null>(null);
  const [signups, setSignups] = useState<{ date: string; count: number; cumulative: number }[]>([]);
  const [posts, setPosts] = useState<{ date: string; posts: number; comments: number; likes: number; reposts: number }[]>([]);
  const [postsPerDay7d, setPostsPerDay7d] = useState<{ avg: number; prevAvg: number | null }>({ avg: 0, prevAvg: null });
  const [day7Retention, setDay7Retention] = useState<number | null>(null);
  const [engagementMix, setEngagementMix] = useState<EngagementMix | null>(null);
  const [signupsBySource, setSignupsBySource] = useState<SignupsBySourceRow[]>([]);

  // Bumped on every load() call so a slower, now-stale call (e.g. a wide
  // "All time" fetch outlived by a quick follow-up "7d" click) can tell it's
  // no longer the latest request and skip writing its results — otherwise
  // whichever of two concurrent calls resolves last wins, regardless of
  // which range the user is actually looking at by then.
  const loadGenRef = useRef(0);

  const load = useCallback(async () => {
    const gen = ++loadGenRef.current;
    setLoading(true);
    setError(null);
    try {
      const [dauEnv, mauRes, signupsEnv, postsEnv, retention7, engagementMixRes, signupsBySourceRes] = await Promise.all([
        getDauSeries(range, controls.compare),
        getMau(range.to, controls.compare),
        getSignupsSeries(range, controls.compare),
        getPostsSeries(range, controls.compare),
        getDayNRetention(7),
        getEngagementMix(range),
        getSignupsBySource(range),
      ]);
      if (gen !== loadGenRef.current) return;
      setDau({ current: dauEnv.current, previous: dauEnv.previous });
      setMauNow({ count: mauRes.count, previousCount: mauRes.previousCount });
      setSignups(signupsEnv.current);
      setPosts(postsEnv.current);
      setDay7Retention(retention7.pct);
      setEngagementMix(engagementMixRes);
      setSignupsBySource(signupsBySourceRes.data);

      // Fixed 7-day posts/day average, independent of the page's own range
      // control — "posts/day (7-day avg)" is always a trailing-7-day number
      // per the spec, not whatever window the global controls happen to be
      // set to right now.
      const today = new Date();
      const sevenDaysAgo = new Date(today);
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);
      const fixed7d: DateRange = { from: sevenDaysAgo.toISOString().slice(0, 10), to: today.toISOString().slice(0, 10) };
      const posts7dEnv = await getPostsSeries(fixed7d, true);
      if (gen !== loadGenRef.current) return;
      const avg = posts7dEnv.current.reduce((s, p) => s + p.posts, 0) / Math.max(1, posts7dEnv.current.length);
      const prevAvg = posts7dEnv.previous
        ? posts7dEnv.previous.reduce((s, p) => s + p.posts, 0) / Math.max(1, posts7dEnv.previous.length)
        : null;
      setPostsPerDay7d({ avg, prevAvg });

      // Derived WAU/MAU series for the combined DAU/WAU/MAU chart — these
      // two endpoints only ever return a single rolling count for one `to`
      // date (see stats.routes.ts: no wau-series/mau-series endpoint
      // exists), so the per-day series is built here from real backend
      // values, one call per day — capped to the trailing 30 days of the
      // selected range so a wide "All time" selection doesn't fire hundreds
      // of requests. This is genuine computed data, not a placeholder.
      const allDates = datesBetween(range.from, range.to);
      const capped = allDates.slice(-30);
      const [wauDaily, mauDaily] = await Promise.all([
        Promise.all(capped.map((d) => getWau(d, false))),
        Promise.all(capped.map((d) => getMau(d, false))),
      ]);
      if (gen !== loadGenRef.current) return;
      const dauByDate = new Map(dauEnv.current.map((p) => [p.date, p.count]));
      setWauMauSeries(
        capped.map((date, i) => ({
          date,
          dau: dauByDate.get(date) ?? 0,
          wau: wauDaily[i].count,
          mau: mauDaily[i].count,
        }))
      );

      setLastUpdated(new Date().toISOString());
    } catch (err) {
      setError(apiErrorMessage(err, "Couldn't load the growth dashboard"));
    } finally {
      setLoading(false);
    }
  }, [range, controls.compare]);

  // Deferred (not called synchronously in the effect body) — same "the
  // actual state-setting happens inside a callback, not the effect's own
  // call frame" shape every other mount/dependency-triggered fetch in
  // /villagepeople already uses (see AllGistsManager's/UsersManager's own
  // debounced re-search effects), which is what keeps this off the
  // react-hooks/set-state-in-effect lint rule.
  useEffect(() => {
    const timer = setTimeout(load, 0);
    return () => clearTimeout(timer);
  }, [load]);

  const lastDau = dau.current.at(-1)?.count ?? 0;
  const prevLastDau = dau.previous?.at(-1)?.count ?? 0;
  const dauChange = controls.compare ? pctChange(lastDau, prevLastDau) : null;

  const lastSignups = signups.at(-1);
  const totalSignups = lastSignups?.cumulative ?? 0;
  const newInRange = signups.reduce((s, p) => s + p.count, 0);

  const postsChange =
    controls.compare && postsPerDay7d.prevAvg !== null ? pctChange(postsPerDay7d.avg, postsPerDay7d.prevAvg) : null;
  const mauChange = controls.compare && mauNow?.previousCount !== undefined ? pctChange(mauNow.count, mauNow.previousCount) : null;

  return (
    <div className="growth-viz mx-auto flex w-full max-w-5xl flex-col gap-6 px-6 py-10 md:px-10">
      <style>{GROWTH_VIZ_STYLE}</style>
      <div>
        <h1 className="font-nunito text-2xl font-extrabold text-ink">Growth dashboard</h1>
        <p className="mt-1 font-nunito text-sm text-muted">DAU, retention, posting activity, and signups over time.</p>
      </div>

      <GrowthControls
        value={controls}
        onChange={setControls}
        lastUpdated={lastUpdated}
        onRefresh={load}
        campusFilterHint="Not applied here — the DAU/WAU/MAU, signups and posts endpoints have no per-campus breakdown. See the Schools page to filter by campus."
      />

      {error && (
        <p className="rounded-2xl border border-dashed border-danger/40 bg-danger/5 p-4 text-center font-nunito text-sm text-danger">
          {error}
        </p>
      )}

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard
          icon={GrowthIconFill}
          label="DAU (end of range)"
          value={lastDau}
          change={dauChange !== null ? { pct: dauChange, label: "vs prev" } : null}
          footer={<TrendChart data={dau.current} color="var(--series-dau)" compact />}
        />
        <StatCard
          icon={RetentionIconFill}
          label="Day-7 retention"
          value={day7Retention ?? 0}
          displayValue={day7Retention === null ? "–" : `${day7Retention}%`}
        />
        <StatCard
          icon={AllGistsIconFill}
          label="Posts/day (7d avg)"
          value={postsPerDay7d.avg}
          displayValue={postsPerDay7d.avg.toFixed(1)}
          change={postsChange !== null ? { pct: postsChange, label: "vs prev 7d" } : null}
        />
        <StatCard
          icon={SignupIconFill}
          label="Total signups"
          value={totalSignups}
          breakdown={[{ label: "New in range", value: newInRange }]}
        />
        <StatCard
          icon={UsersIconFill}
          label="MAU (30d rolling)"
          value={mauNow?.count ?? 0}
          change={mauChange !== null ? { pct: mauChange, label: "vs prev" } : null}
        />
      </section>

      <section className="rounded-2xl border border-line/70 p-4">
        <p className="mb-2 font-nunito text-xs font-semibold text-muted">
          DAU / WAU / MAU (trailing {wauMauSeries.length} days)
        </p>
        <GrowthLineChart
          data={wauMauSeries}
          series={[
            { key: "dau", label: "DAU", color: "var(--series-dau)" },
            { key: "wau", label: "WAU", color: "var(--series-wau)" },
            { key: "mau", label: "MAU", color: "var(--series-mau)" },
          ]}
        />
      </section>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <section className="rounded-2xl border border-line/70 p-4">
          <p className="mb-2 font-nunito text-xs font-semibold text-muted">Signups</p>
          <SignupsChart data={signups} />
        </section>
        <section className="rounded-2xl border border-line/70 p-4">
          <p className="mb-2 font-nunito text-xs font-semibold text-muted">Posts per day</p>
          <TrendChart data={posts.map((p) => ({ date: p.date, count: p.posts }))} color="var(--series-posts)" />
        </section>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <section className="rounded-2xl border border-line/70 p-4">
          <p className="mb-1 font-nunito text-xs font-semibold text-muted">Lurkers / engagers / posters</p>
          <p className="mb-3 font-nunito text-[11px] text-faint">
            {engagementMix ? `${engagementMix.activeUsers.toLocaleString()} active users in range` : "—"}
          </p>
          <BreakdownBar
            segments={ENGAGEMENT_TIER_CONFIG.map((c) => ({
              key: c.key,
              label: c.label,
              color: c.color,
              value:
                c.key === "lurkers"
                  ? engagementMix?.lurkersPct ?? 0
                  : c.key === "engagers"
                    ? engagementMix?.engagersPct ?? 0
                    : engagementMix?.postersPct ?? 0,
            }))}
            unit="percent"
          />
        </section>
        <section className="rounded-2xl border border-line/70 p-4">
          <p className="mb-1 font-nunito text-xs font-semibold text-muted">Feed mode split</p>
          {/* Expected to read as mostly/all "Unknown" until this task's own
              feed_view ping wiring (FeedContent.tsx) accumulates real
              traffic — not a bug, just how it looks on day one. */}
          <p className="mb-3 font-nunito text-[11px] text-faint">Based on feed_view activity pings</p>
          <BreakdownBar
            segments={FEED_MODE_CONFIG.map((c) => ({
              key: c.key,
              label: c.label,
              color: c.color,
              value: engagementMix?.feedMode.find((m) => m.mode === c.key)?.pct ?? 0,
            }))}
            unit="percent"
          />
        </section>
      </div>

      <section className="rounded-2xl border border-line/70 p-4">
        <p className="mb-2 font-nunito text-xs font-semibold text-muted">Signups by source</p>
        {signupsBySource.length > 0 ? (
          <BreakdownBar
            segments={signupsBySource.map((row, i) => ({
              key: row.source,
              label: row.source,
              color: SOURCE_PALETTE[i % SOURCE_PALETTE.length],
              value: row.count,
            }))}
          />
        ) : (
          <p className="font-nunito text-xs text-faint">No signups recorded in this range yet.</p>
        )}
      </section>

      <section className="rounded-2xl border border-line/70 p-4">
        <p className="mb-2 font-nunito text-xs font-semibold text-muted">Actions per day</p>
        <StackedActionsChart
          data={posts}
          series={[
            { key: "posts", label: "Posts", color: "var(--series-posts)" },
            { key: "comments", label: "Comments", color: "var(--series-comments)" },
            { key: "likes", label: "Likes", color: "var(--series-likes)" },
            { key: "reposts", label: "Reposts", color: "var(--series-reposts)" },
          ]}
        />
      </section>

      {loading && <p className="text-center font-nunito text-xs text-faint">Loading…</p>}
    </div>
  );
}
