"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  getKpiSummary,
  getFollowersSeries,
  getContentMix,
  getContentPerformance,
  getTopContent,
  apiErrorMessage,
  type SocialsKpiSummary,
  type FollowersSeriesPoint,
  type ContentMixResult,
  type ContentPerformanceRow,
  type TopContentResult,
  type TopContentRow,
  type SocialPlatform,
  type ContentType,
} from "@/lib/growthApi";
import { computeRange, type DateRange } from "@/lib/growthRange";
import { GrowthControls, type GrowthControlsValue } from "@/components/villagepeople/GrowthControls";
import { StatCard } from "../../HqDashboard";
import { GrowthLineChart, StackedActionsChart, ContentPerformanceChart } from "@/components/villagepeople/GrowthCharts";
import {
  CommunityIconFill,
  TrendingIconFill,
  AllGistsIconFill,
  ViewIconFill,
  EngagementIconFill,
  ExternalLinkIconFill,
} from "@/components/ui/icons";

/**
 * Chart-only color slots for this section, same scoped-`<style>`-block
 * pattern HqDashboard.tsx/GrowthDashboardClient.tsx already document (CSS
 * vars under a page-local class, not global tokens) — platform colors for
 * the followers-over-time lines, content-type colors for the content-mix
 * stack, and a fresh pair for the content-performance chart's two series.
 */
const SOCIALS_VIZ_STYLE = `
.socials-viz {
  --series-tiktok: #e87ba4;
  --series-instagram: #eb6834;
  --series-x: #2a2f3a;
  --series-whatsapp: #1baf7a;
  --cat-product-talk: #165abf;
  --cat-storytelling: #0bb0ff;
  --cat-spotlight: #eda100;
  --cat-meme: #eb6834;
  --cat-motion-design: #1baf7a;
  --series-avg-views: #165abf;
  --series-avg-engagement: #eb6834;
}
.dark .socials-viz {
  --series-tiktok: #d55181;
  --series-instagram: #d95926;
  --series-x: #cfd4de;
  --series-whatsapp: #199e70;
  --cat-storytelling: #39c3ff;
  --cat-spotlight: #c98500;
  --cat-meme: #d95926;
  --cat-motion-design: #199e70;
  --series-avg-engagement: #d95926;
}
`;

const PLATFORM_LABEL: Record<SocialPlatform, string> = {
  tiktok: "TikTok",
  instagram: "Instagram",
  x: "X",
  whatsapp_channel: "WhatsApp channel",
};
const PLATFORMS: SocialPlatform[] = ["tiktok", "instagram", "x", "whatsapp_channel"];

const CONTENT_TYPE_LABEL: Record<ContentType, string> = {
  product_talk: "Product talk",
  storytelling: "Storytelling",
  spotlight: "Spotlight",
  meme: "Meme",
  motion_design: "Motion design",
};
const CONTENT_TYPES: ContentType[] = ["product_talk", "storytelling", "spotlight", "meme", "motion_design"];
const CONTENT_TYPE_COLOR: Record<ContentType, string> = {
  product_talk: "var(--cat-product-talk)",
  storytelling: "var(--cat-storytelling)",
  spotlight: "var(--cat-spotlight)",
  meme: "var(--cat-meme)",
  motion_design: "var(--cat-motion-design)",
};

/** Worst-first ordering so a single bad month's status wins over a good
 * one when a range spans several months of `kpiTargets` rows. */
const STATUS_RANK: Record<"red" | "amber" | "green", number> = { red: 0, amber: 1, green: 2 };

function worstKpiTarget(
  rows: SocialsKpiSummary["kpiTargets"],
  kpiKey: "new_social_followers" | "content_pieces_posted"
): { target: number | null; actual: number | null; status: "green" | "amber" | "red" | null } {
  const matches = rows.filter((r) => r.kpi_key === kpiKey);
  if (matches.length === 0) return { target: null, actual: null, status: null };
  const target = matches.reduce((s, r) => s + (r.target ?? 0), 0);
  const actual = matches.reduce((s, r) => s + (r.actual ?? 0), 0);
  let status: "green" | "amber" | "red" | null = null;
  for (const m of matches) {
    if (!m.status) continue;
    if (status === null || STATUS_RANK[m.status] < STATUS_RANK[status]) status = m.status;
  }
  return { target, actual, status };
}

function toneForStatus(status: "green" | "amber" | "red" | null): "default" | "warning" {
  return status === "red" ? "warning" : "default";
}

function groupFollowersByWeek(points: FollowersSeriesPoint[]): Record<string, number | string>[] {
  const byWeek = new Map<string, Record<string, number | string>>();
  for (const p of points) {
    const row = byWeek.get(p.weekStarting) ?? { date: p.weekStarting };
    row[p.platform] = p.followerCount;
    byWeek.set(p.weekStarting, row);
  }
  return Array.from(byWeek.values()).sort((a, b) => String(a.date).localeCompare(String(b.date)));
}

function groupContentMixByWeek(series: ContentMixResult["series"]): Record<string, number | string>[] {
  const byWeek = new Map<string, Record<string, number | string>>();
  for (const p of series) {
    const row = byWeek.get(p.weekStarting) ?? { date: p.weekStarting };
    row[p.content_type] = p.count;
    byWeek.set(p.weekStarting, row);
  }
  return Array.from(byWeek.values()).sort((a, b) => String(a.date).localeCompare(String(b.date)));
}

function TopContentTable({ title, rows }: { title: string; rows: TopContentRow[] }) {
  return (
    <section>
      <h3 className="mb-2 font-nunito text-xs font-bold text-ink">{title}</h3>
      {rows.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-line/70 p-5 text-center font-nunito text-xs text-muted">
          No content logged in this range.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-line/70">
          <table className="w-full min-w-[640px] border-collapse">
            <thead>
              <tr className="border-b border-line/70 bg-line/10">
                {["#", "Title", "Platform", "Type", "Views", "Likes", "Comments", "Shares", "Eng. %", ""].map((h) => (
                  <th key={h} className="px-2.5 py-2 text-left font-nunito text-[11px] font-bold text-muted">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={`${r.title}-${i}`} className="border-b border-line/40 last:border-0">
                  <td className="px-2.5 py-2 font-nunito text-xs font-bold text-brand">{i + 1}</td>
                  <td className="max-w-[220px] truncate px-2.5 py-2 font-nunito text-xs text-ink">{r.title}</td>
                  <td className="px-2.5 py-2 font-nunito text-xs text-faint">{PLATFORM_LABEL[r.platform]}</td>
                  <td className="px-2.5 py-2 font-nunito text-xs text-faint">{CONTENT_TYPE_LABEL[r.content_type]}</td>
                  <td className="px-2.5 py-2 font-nunito text-xs text-ink">{(r.views ?? 0).toLocaleString()}</td>
                  <td className="px-2.5 py-2 font-nunito text-xs text-ink">{(r.likes ?? 0).toLocaleString()}</td>
                  <td className="px-2.5 py-2 font-nunito text-xs text-ink">{(r.comments ?? 0).toLocaleString()}</td>
                  <td className="px-2.5 py-2 font-nunito text-xs text-ink">{(r.shares ?? 0).toLocaleString()}</td>
                  <td className="px-2.5 py-2 font-nunito text-xs text-ink">
                    {r.engagementRate == null ? "–" : `${r.engagementRate}%`}
                  </td>
                  <td className="px-2.5 py-2">
                    {r.link && (
                      <a
                        href={r.link}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label="Open content"
                        className="flex h-6 w-6 items-center justify-center rounded-full text-muted hover:bg-brand/10 hover:text-brand"
                      >
                        <ExternalLinkIconFill className="h-3.5 w-3.5" />
                      </a>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

/**
 * Charts + KPIs for the Socials page, sitting above the existing manual
 * weekly-stats/content-log CRUD tabs (SocialsManager.tsx) — reads the data
 * those CRUD sections write, through the read-only analytics endpoints
 * (socials.routes.ts's own followers-series/content-mix/content-performance/
 * top-content/kpi-summary), rather than re-deriving anything client-side.
 * None of these endpoints take `compare`, and there's no per-campus concept
 * for social platforms, so the shared GrowthControls bar hides both those
 * controls here — same pattern TopListsManager/RetentionManager's heatmap
 * section already use for their own non-compare/non-campus endpoints.
 */
export function SocialsAnalytics() {
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

  const [kpi, setKpi] = useState<SocialsKpiSummary | null>(null);
  const [followers, setFollowers] = useState<FollowersSeriesPoint[]>([]);
  const [contentMix, setContentMix] = useState<ContentMixResult | null>(null);
  const [contentPerf, setContentPerf] = useState<ContentPerformanceRow[]>([]);
  const [topContent, setTopContent] = useState<TopContentResult | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadGenRef = useRef(0);
  const load = useCallback(() => {
    const gen = ++loadGenRef.current;
    setLoading(true);
    setError(null);
    Promise.all([
      getKpiSummary(range),
      getFollowersSeries(range),
      getContentMix(range),
      getContentPerformance(range),
      getTopContent(range),
    ])
      .then(([kpiRes, followersRes, mixRes, perfRes, topRes]) => {
        if (gen !== loadGenRef.current) return;
        setKpi(kpiRes);
        setFollowers(followersRes);
        setContentMix(mixRes);
        setContentPerf(perfRes);
        setTopContent(topRes);
        setLastUpdated(new Date().toISOString());
      })
      .catch((err) => {
        if (gen !== loadGenRef.current) return;
        setError(apiErrorMessage(err, "Couldn't load socials analytics"));
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

  const newFollowersTarget = kpi ? worstKpiTarget(kpi.kpiTargets, "new_social_followers") : null;
  const contentPiecesTarget = kpi ? worstKpiTarget(kpi.kpiTargets, "content_pieces_posted") : null;

  const followersData = useMemo(() => groupFollowersByWeek(followers), [followers]);
  const contentMixData = useMemo(() => (contentMix ? groupContentMixByWeek(contentMix.series) : []), [contentMix]);
  const contentPerfData = useMemo(
    () =>
      contentPerf.map((r) => ({
        content_type: r.content_type,
        label: CONTENT_TYPE_LABEL[r.content_type],
        avgViews: r.avgViews ?? 0,
        avgEngagementRate: r.avgEngagementRate ?? 0,
      })),
    [contentPerf]
  );

  return (
    <div className="socials-viz flex flex-col gap-6">
      <style>{SOCIALS_VIZ_STYLE}</style>

      <GrowthControls
        value={controls}
        onChange={setControls}
        lastUpdated={lastUpdated}
        onRefresh={load}
        showCompare={false}
        showCampusFilter={false}
      />

      {error && (
        <p className="rounded-2xl border border-dashed border-danger/40 bg-danger/5 p-4 text-center font-nunito text-sm text-danger">
          {error}
        </p>
      )}

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard icon={CommunityIconFill} label="Total followers" value={kpi?.totalFollowers ?? 0} />
        <StatCard
          icon={TrendingIconFill}
          label="New followers this period"
          value={kpi?.newFollowersThisPeriod ?? 0}
          tone={toneForStatus(newFollowersTarget?.status ?? null)}
          breakdown={newFollowersTarget?.target != null ? [{ label: "Target", value: newFollowersTarget.target }] : undefined}
        />
        <StatCard
          icon={AllGistsIconFill}
          label="Content pieces posted"
          value={kpi?.contentPiecesPosted ?? 0}
          tone={toneForStatus(contentPiecesTarget?.status ?? null)}
          breakdown={
            contentPiecesTarget?.target != null ? [{ label: "Target", value: contentPiecesTarget.target }] : undefined
          }
        />
        <StatCard icon={ViewIconFill} label="Total views" value={kpi?.totalViews ?? 0} />
        <StatCard
          icon={EngagementIconFill}
          label="Avg engagement rate"
          value={kpi?.avgEngagementRate ?? 0}
          displayValue={kpi?.avgEngagementRate == null ? "–" : `${kpi.avgEngagementRate}%`}
        />
      </section>

      <section className="rounded-2xl border border-line/70 p-4">
        <p className="mb-2 font-nunito text-xs font-semibold text-muted">Followers over time</p>
        {followersData.length === 0 ? (
          <p className="py-8 text-center font-nunito text-xs text-faint">No follower data in this range.</p>
        ) : (
          <GrowthLineChart
            data={followersData}
            series={PLATFORMS.map((p) => ({ key: p, label: PLATFORM_LABEL[p], color: `var(--series-${p === "whatsapp_channel" ? "whatsapp" : p})` }))}
          />
        )}
      </section>

      <section className="rounded-2xl border border-line/70 p-4">
        <p className="mb-2 font-nunito text-xs font-semibold text-muted">Content mix (pieces per week)</p>
        {contentMixData.length === 0 ? (
          <p className="py-8 text-center font-nunito text-xs text-faint">No content logged in this range.</p>
        ) : (
          <StackedActionsChart
            data={contentMixData}
            series={CONTENT_TYPES.map((t) => ({ key: t, label: CONTENT_TYPE_LABEL[t], color: CONTENT_TYPE_COLOR[t] }))}
            referenceLine={contentMix ? { y: contentMix.targets.total, label: `Target: ${contentMix.targets.total}/wk` } : undefined}
          />
        )}
      </section>

      <section className="rounded-2xl border border-line/70 p-4">
        <p className="mb-2 font-nunito text-xs font-semibold text-muted">Content performance by type</p>
        {contentPerfData.length === 0 ? (
          <p className="py-8 text-center font-nunito text-xs text-faint">No content logged in this range.</p>
        ) : (
          <ContentPerformanceChart data={contentPerfData} />
        )}
      </section>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <TopContentTable title="Top 10 by views" rows={topContent?.byViews ?? []} />
        <TopContentTable title="Top 10 by engagement" rows={topContent?.byEngagement ?? []} />
      </div>

      {loading && <p className="text-center font-nunito text-xs text-faint">Loading…</p>}
    </div>
  );
}
