import { api, apiErrorMessage } from "@/lib/api";
import type { DateRange } from "@/lib/growthRange";

/**
 * Client-side fetch wrappers for the growth dashboard's backend endpoints
 * (KamposBackend's stats/targets/socials modules — see those routes'/
 * repos' own doc comments for exact semantics). Every shape here is copied
 * straight from the corresponding repo.ts return type, not guessed — these
 * are genuinely the wire shapes, since the controllers just `res.json({
 * success, data })` the repo's own return value with no remapping.
 *
 * All calls go through `api` (this app's own `/api/v1` cookie-auth proxy),
 * same convention as referenceAdminStore.ts and every other Group B/C admin
 * store — never the backend origin directly from the browser.
 */

function qs(range: DateRange, extra?: Record<string, string | boolean | undefined>): string {
  const params = new URLSearchParams({ from: range.from, to: range.to });
  if (extra) {
    for (const [k, v] of Object.entries(extra)) {
      if (v !== undefined) params.set(k, String(v));
    }
  }
  return params.toString();
}

export interface DaySeriesPoint {
  date: string;
  count: number;
}
export interface SeriesEnvelope<T> {
  range: DateRange;
  current: T[];
  previousRange?: DateRange;
  previous?: T[];
}

export async function getDauSeries(range: DateRange, compare = false): Promise<SeriesEnvelope<DaySeriesPoint>> {
  const res = await api.get(`/idiot/stats/dau-series?${qs(range, { compare })}`);
  return res.data.data;
}

export interface RollingCount {
  asOf: string;
  windowDays: number;
  count: number;
  previousAsOf?: string;
  previousCount?: number;
}

export async function getMau(to: string, compare = false): Promise<RollingCount> {
  const res = await api.get(`/idiot/stats/mau?to=${to}&compare=${compare}`);
  return res.data.data;
}

export async function getWau(to: string, compare = false): Promise<RollingCount> {
  const res = await api.get(`/idiot/stats/wau?to=${to}&compare=${compare}`);
  return res.data.data;
}

export interface StickinessPoint {
  date: string;
  dau: number;
  mau: number;
  ratio: number | null;
}
export async function getStickinessSeries(range: DateRange, compare = false): Promise<SeriesEnvelope<StickinessPoint>> {
  const res = await api.get(`/idiot/stats/stickiness-series?${qs(range, { compare })}`);
  return res.data.data;
}

export interface SignupsSeriesPoint {
  date: string;
  count: number;
  cumulative: number;
}
export async function getSignupsSeries(range: DateRange, compare = false): Promise<SeriesEnvelope<SignupsSeriesPoint>> {
  const res = await api.get(`/idiot/stats/signups-series?${qs(range, { compare })}`);
  return res.data.data;
}

export interface PostsSeriesPoint {
  date: string;
  posts: number;
  comments: number;
  likes: number;
  reposts: number;
}
export async function getPostsSeries(range: DateRange, compare = false): Promise<SeriesEnvelope<PostsSeriesPoint>> {
  const res = await api.get(`/idiot/stats/posts-series?${qs(range, { compare })}`);
  return res.data.data;
}

export interface RetentionCohort {
  cohortWeekStart: string;
  cohortSize: number;
  weeks: { weekIndex: number; pct: number | null }[];
}
export async function getRetentionCohorts(): Promise<RetentionCohort[]> {
  const res = await api.get(`/idiot/stats/retention-cohorts`);
  return res.data.data;
}

export interface DayNRetention {
  n: number;
  cohortDay: string;
  cohortSize: number;
  activeCount: number;
  pct: number | null;
}
export async function getDayNRetention(n: 1 | 7 | 30): Promise<DayNRetention> {
  const res = await api.get(`/idiot/stats/retention/${n}`);
  return res.data.data;
}

export interface HeatmapCell {
  dayOfWeek: number;
  hour: number;
  count: number;
}
export async function getActivityHeatmap(range: DateRange, compare = false): Promise<SeriesEnvelope<HeatmapCell>> {
  const res = await api.get(`/idiot/stats/activity-heatmap?${qs(range, { compare })}`);
  return res.data.data;
}

export interface ActivationRate {
  signups: number;
  activated: number;
  pct: number | null;
}
export interface ActivationEnvelope {
  range: DateRange;
  current: ActivationRate;
  previousRange?: DateRange;
  previous?: ActivationRate;
}
export async function getActivationRate(range: DateRange, compare = false): Promise<ActivationEnvelope> {
  const res = await api.get(`/idiot/stats/activation-rate?${qs(range, { compare })}`);
  return res.data.data;
}

export interface SchoolBreakdownRow {
  campusTag: string;
  campusName: string;
  totalUsers: number;
  dau: number;
  mau: number;
  stickiness: number | null;
  postsPerDayAvg: number;
  day7Retention: number | null;
  newSignups: number;
}
export async function getSchoolsBreakdown(
  range: DateRange,
  compare = false
): Promise<{ range: DateRange; current: SchoolBreakdownRow[]; previousRange?: DateRange; previous?: SchoolBreakdownRow[] }> {
  const res = await api.get(`/idiot/stats/schools-breakdown?${qs(range, { compare })}`);
  return res.data.data;
}

export interface TopPost {
  gistId: string;
  avitag: string;
  authorName: string | null;
  campusTag: string | null;
  preview: string;
  likes: number;
  comments: number;
  reposts: number;
  total: number;
  createdAt: string;
}
export async function getTopPosts(range: DateRange): Promise<TopPost[]> {
  const res = await api.get(`/idiot/stats/top-posts?${qs(range)}`);
  return res.data.data.data;
}

export interface TopUser {
  avitag: string;
  authorName: string | null;
  campusTag: string | null;
  posts: number;
  comments: number;
  total: number;
}
export async function getTopUsers(range: DateRange): Promise<TopUser[]> {
  const res = await api.get(`/idiot/stats/top-users?${qs(range)}`);
  return res.data.data.data;
}

export type TargetType = "cumulative" | "point_in_time" | "monthly_total" | "daily_average";

export interface TargetRow {
  id: number;
  month: string;
  kpi_key: string;
  target_value: string;
  type: TargetType;
  created_at: string;
  updated_at: string;
}
export async function listTargets(from?: string, to?: string): Promise<TargetRow[]> {
  const params = new URLSearchParams();
  if (from) params.set("from", from);
  if (to) params.set("to", to);
  const res = await api.get(`/idiot/targets${params.toString() ? `?${params.toString()}` : ""}`);
  return res.data.data;
}
export async function upsertTarget(input: {
  month: string;
  kpi_key: string;
  target_value: number;
  type: TargetType;
}): Promise<TargetRow> {
  const res = await api.post(`/idiot/targets`, input);
  return res.data.data;
}
export async function deleteTarget(id: number): Promise<void> {
  await api.delete(`/idiot/targets/${id}`);
}

export interface TargetVsActual {
  month: string;
  kpi_key: string;
  target: number | null;
  actual: number | null;
  status: "green" | "amber" | "red" | null;
}
export async function getTargetsVsActuals(from: string, to: string): Promise<TargetVsActual[]> {
  const res = await api.get(`/idiot/stats/targets-vs-actuals?from=${from}&to=${to}`);
  return res.data.data;
}

export type SocialPlatform = "tiktok" | "instagram" | "x" | "whatsapp_channel";
export type ContentType = "product_talk" | "storytelling" | "spotlight" | "meme" | "motion_design";

export interface SocialWeeklyStatRow {
  id: number;
  week_starting: string;
  platform: SocialPlatform;
  follower_count: number;
  posts_published: number;
  total_views: number;
  likes: number;
  comments: number;
  shares: number;
  saves: number;
  link_clicks: number | null;
  created_at: string;
}
export interface SocialWeeklyStatInput {
  week_starting: string;
  platform: SocialPlatform;
  follower_count: number;
  posts_published: number;
  total_views: number;
  likes: number;
  comments: number;
  shares: number;
  saves: number;
  link_clicks?: number | null;
}
export async function listWeeklyStats(): Promise<SocialWeeklyStatRow[]> {
  const res = await api.get(`/idiot/socials/weekly-stats`);
  return res.data.data;
}
export async function createWeeklyStat(input: SocialWeeklyStatInput): Promise<SocialWeeklyStatRow> {
  const res = await api.post(`/idiot/socials/weekly-stats`, input);
  return res.data.data;
}
export async function updateWeeklyStat(id: number, input: Partial<SocialWeeklyStatInput>): Promise<SocialWeeklyStatRow> {
  const res = await api.patch(`/idiot/socials/weekly-stats/${id}`, input);
  return res.data.data;
}
export async function deleteWeeklyStat(id: number): Promise<void> {
  await api.delete(`/idiot/socials/weekly-stats/${id}`);
}

export interface ContentLogRow {
  id: number;
  posted_at: string;
  platform: SocialPlatform;
  content_type: ContentType;
  title: string;
  link: string | null;
  views: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  created_at: string;
}
export interface ContentLogInput {
  posted_at: string;
  platform: SocialPlatform;
  content_type: ContentType;
  title: string;
  link?: string | null;
  views?: number | null;
  likes?: number | null;
  comments?: number | null;
  shares?: number | null;
}
export async function listContentLog(): Promise<ContentLogRow[]> {
  const res = await api.get(`/idiot/socials/content-log`);
  return res.data.data;
}
export async function createContentLog(input: ContentLogInput): Promise<ContentLogRow> {
  const res = await api.post(`/idiot/socials/content-log`, input);
  return res.data.data;
}
export async function updateContentLog(id: number, input: Partial<ContentLogInput>): Promise<ContentLogRow> {
  const res = await api.patch(`/idiot/socials/content-log/${id}`, input);
  return res.data.data;
}
export async function deleteContentLog(id: number): Promise<void> {
  await api.delete(`/idiot/socials/content-log/${id}`);
}

export interface FollowersSeriesPoint {
  weekStarting: string;
  platform: SocialPlatform;
  followerCount: number;
}
export async function getFollowersSeries(range: DateRange): Promise<FollowersSeriesPoint[]> {
  const res = await api.get(`/idiot/socials/followers-series?${qs(range)}`);
  return res.data.data.data;
}

export interface ContentMixPoint {
  weekStarting: string;
  content_type: ContentType;
  count: number;
}
export interface ContentMixTargets {
  total: number;
  product_talk: number;
  storytelling: number;
  spotlight: number;
  meme: number;
  motion_design: number;
}
export interface ContentMixResult {
  series: ContentMixPoint[];
  targets: ContentMixTargets;
}
export async function getContentMix(range: DateRange): Promise<ContentMixResult> {
  const res = await api.get(`/idiot/socials/content-mix?${qs(range)}`);
  return res.data.data;
}

export interface ContentPerformanceRow {
  content_type: ContentType;
  avgViews: number | null;
  avgEngagementRate: number | null;
  postCount: number;
}
export async function getContentPerformance(range: DateRange): Promise<ContentPerformanceRow[]> {
  const res = await api.get(`/idiot/socials/content-performance?${qs(range)}`);
  return res.data.data.data;
}

export interface TopContentRow {
  platform: SocialPlatform;
  content_type: ContentType;
  title: string;
  link: string | null;
  views: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  engagementRate: number | null;
}
export interface TopContentResult {
  byViews: TopContentRow[];
  byEngagement: TopContentRow[];
}
export async function getTopContent(range: DateRange): Promise<TopContentResult> {
  const res = await api.get(`/idiot/socials/top-content?${qs(range)}`);
  return res.data.data;
}

export interface SocialsKpiTarget {
  month: string;
  kpi_key: "new_social_followers" | "content_pieces_posted";
  target: number | null;
  actual: number | null;
  status: "green" | "amber" | "red" | null;
}
export interface SocialsKpiSummary {
  totalFollowers: number;
  newFollowersThisPeriod: number;
  contentPiecesPosted: number;
  totalViews: number;
  avgEngagementRate: number | null;
  kpiTargets: SocialsKpiTarget[];
}
export async function getKpiSummary(range: DateRange): Promise<SocialsKpiSummary> {
  const res = await api.get(`/idiot/socials/kpi-summary?${qs(range)}`);
  return res.data.data;
}

export interface ActivationFunnelStep {
  step: "signed_up" | "completed_profile" | "viewed_feed" | "first_action" | "first_post";
  label: string;
  count: number;
  pctOfSignups: number;
  dropoffFromPrevPct: number | null;
}
export async function getActivationFunnel(range: DateRange): Promise<ActivationFunnelStep[]> {
  const res = await api.get(`/idiot/stats/activation-funnel?${qs(range)}`);
  return res.data.data.data;
}

export interface TimeToFirstAction {
  avgHours: number | null;
  sampleSize: number;
}
export async function getActivationTimeToFirstAction(range: DateRange): Promise<TimeToFirstAction> {
  const res = await api.get(`/idiot/stats/activation-time-to-first-action?${qs(range)}`);
  return res.data.data;
}

export interface AmeboFirstSessionRate {
  signups: number;
  usedAmeboEarly: number;
  pct: number | null;
}
export async function getAmeboFirstSessionRate(range: DateRange): Promise<AmeboFirstSessionRate> {
  const res = await api.get(`/idiot/stats/amebo-first-session-rate?${qs(range)}`);
  return res.data.data;
}

export interface GrowthFunnelStep {
  step: "content_views" | "clicks" | "signups" | "activated" | "retained_day7";
  label: string;
  count: number;
  conversionFromPrevPct: number | null;
}
export interface GrowthFunnelResult {
  steps: GrowthFunnelStep[];
  weakestStep: GrowthFunnelStep["step"] | null;
}
export async function getGrowthFunnel(range: DateRange): Promise<GrowthFunnelResult> {
  const res = await api.get(`/idiot/stats/growth-funnel?${qs(range)}`);
  return res.data.data;
}

export interface FeedModeSplit {
  mode: string;
  pct: number;
}
export interface EngagementMix {
  range: DateRange;
  activeUsers: number;
  lurkersPct: number;
  engagersPct: number;
  postersPct: number;
  /** Will legitimately read as mostly/all `"unknown"` until real
   * `feed_view` ping traffic accumulates (see activityPing.ts) — expected
   * on day one, not a bug. */
  feedMode: FeedModeSplit[];
}
export async function getEngagementMix(range: DateRange): Promise<EngagementMix> {
  const res = await api.get(`/idiot/stats/engagement-mix?${qs(range)}`);
  return res.data.data;
}

export interface SignupsBySourceRow {
  source: string;
  count: number;
}
export interface SignupsBySource {
  range: DateRange;
  data: SignupsBySourceRow[];
}
export async function getSignupsBySource(range: DateRange): Promise<SignupsBySource> {
  const res = await api.get(`/idiot/stats/signups-by-source?${qs(range)}`);
  return res.data.data;
}

/** % change of `current` vs `previous`, for StatCard's `change` prop — null
 * when previous was 0 and current isn't (an undefined "+infinity%" rather
 * than a real percentage), 0 when both are 0. */
export function pctChange(current: number, previous: number): number | null {
  if (previous === 0) return current === 0 ? 0 : null;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

export { apiErrorMessage };
