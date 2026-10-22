"use client";

import {
  AreaChart,
  Area,
  Line,
  Bar,
  BarChart,
  ComposedChart,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
} from "recharts";
import { formatDay, niceTicks } from "./chartUtils";

/**
 * Growth-dashboard chart family — DAU/WAU/MAU combined line, signups
 * (cumulative line + daily bar), and the posts/comments/likes/reposts
 * stacked bar. Built as siblings of TrendChart (same CSS-var color
 * convention, same niceTicks/formatDay helpers, same tooltip/grid/axis
 * styling) rather than extending TrendChart itself, since TrendChart is
 * documented as deliberately single-series — these are genuinely
 * multi-series and need their own Legend.
 */

interface Series {
  key: string;
  label: string;
  color: string;
}

function MultiTooltip({
  active,
  payload,
  label,
  series,
  suffix,
}: {
  active?: boolean;
  payload?: { dataKey: string; value: number }[];
  label?: string;
  series: Series[];
  suffix?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-line/70 bg-surface-2 px-3 py-2 shadow-lg">
      <p className="mb-1 font-nunito text-[11px] text-muted">{label ? formatDay(label) : ""}</p>
      <div className="flex flex-col gap-0.5">
        {series.map((s) => {
          const point = payload.find((p) => p.dataKey === s.key);
          if (!point) return null;
          return (
            <div key={s.key} className="flex items-center gap-1.5">
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: s.color }} />
              <span className="font-nunito text-xs text-faint">{s.label}</span>
              <span className="font-nunito text-xs font-extrabold text-ink">
                {point.value.toLocaleString()}
                {suffix ?? ""}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function LegendRow({ series }: { series: Series[] }) {
  return (
    <div className="mb-1 flex flex-wrap gap-x-3 gap-y-1">
      {series.map((s) => (
        <div key={s.key} className="flex items-center gap-1.5">
          <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: s.color }} />
          <span className="font-nunito text-[11px] text-faint">{s.label}</span>
        </div>
      ))}
    </div>
  );
}

/** DAU / WAU / MAU as three lines against the same day axis. */
export function GrowthLineChart({
  data,
  series,
}: {
  data: Record<string, number | string>[];
  series: Series[];
}) {
  const max = data.reduce((m, row) => Math.max(m, ...series.map((s) => Number(row[s.key] ?? 0))), 0);
  const ticks = niceTicks(max);
  const domainMax = ticks[ticks.length - 1];

  return (
    <div className="w-full">
      <LegendRow series={series} />
      <div className="h-52 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid stroke="var(--color-line)" vertical={false} strokeDasharray="0" />
            <XAxis
              dataKey="date"
              tickFormatter={formatDay}
              tick={{ fontSize: 10, fill: "var(--color-faint)" }}
              axisLine={false}
              tickLine={false}
              interval="preserveStartEnd"
              minTickGap={40}
            />
            <YAxis
              tick={{ fontSize: 10, fill: "var(--color-faint)" }}
              axisLine={false}
              tickLine={false}
              width={32}
              allowDecimals={false}
              domain={[0, domainMax]}
              tickCount={ticks.length}
            />
            <Tooltip content={<MultiTooltip series={series} />} cursor={{ stroke: "var(--color-line)", strokeWidth: 1 }} />
            {series.map((s) => (
              <Area
                key={s.key}
                type="monotone"
                dataKey={s.key}
                stroke={s.color}
                strokeWidth={2}
                fill={s.color}
                fillOpacity={0.06}
                dot={false}
                activeDot={{ r: 3, stroke: "var(--color-surface)", strokeWidth: 2, fill: s.color }}
                isAnimationActive
                animationDuration={700}
                animationEasing="ease-out"
              />
            ))}
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/** Daily signups as bars + the running cumulative total as a line, sharing
 * one X axis but each on the scale it actually needs — a single shared Y
 * axis is acceptable here (unlike HqDashboard's own signups/gists split)
 * because both series are genuinely the SAME metric (signups), just daily
 * vs. running-total views of it, not two unrelated metrics forced together. */
export function SignupsChart({ data }: { data: { date: string; count: number; cumulative: number }[] }) {
  const maxCount = data.reduce((m, p) => Math.max(m, p.count), 0);
  const countTicks = niceTicks(maxCount);
  const cumulativeMax = data.reduce((m, p) => Math.max(m, p.cumulative), 0);

  return (
    <div className="w-full">
      <LegendRow
        series={[
          { key: "count", label: "New per day", color: "var(--series-signups)" },
          { key: "cumulative", label: "Cumulative", color: "var(--series-cumulative)" },
        ]}
      />
      <div className="h-52 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid stroke="var(--color-line)" vertical={false} strokeDasharray="0" />
            <XAxis
              dataKey="date"
              tickFormatter={formatDay}
              tick={{ fontSize: 10, fill: "var(--color-faint)" }}
              axisLine={false}
              tickLine={false}
              interval="preserveStartEnd"
              minTickGap={40}
            />
            <YAxis
              yAxisId="left"
              tick={{ fontSize: 10, fill: "var(--color-faint)" }}
              axisLine={false}
              tickLine={false}
              width={28}
              allowDecimals={false}
              domain={[0, countTicks[countTicks.length - 1]]}
            />
            <YAxis
              yAxisId="right"
              orientation="right"
              tick={{ fontSize: 10, fill: "var(--color-faint)" }}
              axisLine={false}
              tickLine={false}
              width={32}
              allowDecimals={false}
              domain={[0, Math.max(cumulativeMax, 1)]}
            />
            <Tooltip
              content={
                <MultiTooltip
                  series={[
                    { key: "count", label: "New per day", color: "var(--series-signups)" },
                    { key: "cumulative", label: "Cumulative", color: "var(--series-cumulative)" },
                  ]}
                />
              }
              cursor={{ fill: "var(--color-line)", fillOpacity: 0.3 }}
            />
            <Bar yAxisId="left" dataKey="count" fill="var(--series-signups)" radius={[3, 3, 0, 0]} maxBarSize={18} />
            <Line
              yAxisId="right"
              type="monotone"
              dataKey="cumulative"
              stroke="var(--series-cumulative)"
              strokeWidth={2}
              dot={false}
              isAnimationActive
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/** Posts/comments/likes/reposts per day, stacked — "how people use Kampos,
 * day by day," the daily-granularity sibling of HqDashboard's own lifetime
 * engagement StatCards. Also reused, unmodified in shape, by the Socials
 * page's weekly content-mix chart (its `date` values are week-starting
 * dates — `formatDay` renders those exactly as well as daily ones) — the
 * one addition it needed was an optional dashed target `referenceLine`,
 * since content-mix is the first stacked chart with a fixed weekly target
 * to show against the stack. */
export function StackedActionsChart({
  data,
  series,
  referenceLine,
}: {
  data: Record<string, number | string>[];
  series: Series[];
  /** Dashed horizontal target line (e.g. the 10-pieces/week content-mix
   * target) — Recharts' own ReferenceLine, styled to match this chart's
   * existing muted/faint axis palette rather than a loud standalone color,
   * since it's a target to read against the bars, not its own series. */
  referenceLine?: { y: number; label: string };
}) {
  const max = data.reduce(
    (m, row) => Math.max(m, series.reduce((sum, s) => sum + Number(row[s.key] ?? 0), 0)),
    0
  );
  const ticks = niceTicks(Math.max(max, referenceLine?.y ?? 0));

  return (
    <div className="w-full">
      <LegendRow series={series} />
      <div className="h-52 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid stroke="var(--color-line)" vertical={false} strokeDasharray="0" />
            <XAxis
              dataKey="date"
              tickFormatter={formatDay}
              tick={{ fontSize: 10, fill: "var(--color-faint)" }}
              axisLine={false}
              tickLine={false}
              interval="preserveStartEnd"
              minTickGap={40}
            />
            <YAxis
              tick={{ fontSize: 10, fill: "var(--color-faint)" }}
              axisLine={false}
              tickLine={false}
              width={28}
              allowDecimals={false}
              domain={[0, ticks[ticks.length - 1]]}
            />
            <Tooltip content={<MultiTooltip series={series} />} cursor={{ fill: "var(--color-line)", fillOpacity: 0.3 }} />
            {series.map((s) => (
              <Bar key={s.key} dataKey={s.key} stackId="actions" fill={s.color} maxBarSize={18} />
            ))}
            {referenceLine && (
              <ReferenceLine
                y={referenceLine.y}
                stroke="var(--color-faint)"
                strokeDasharray="4 4"
                strokeWidth={1.5}
                label={{
                  value: referenceLine.label,
                  position: "insideTopRight",
                  fill: "var(--color-faint)",
                  fontSize: 10,
                }}
              />
            )}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/** Avg views (left axis, bar) and avg engagement rate (right axis, bar) per
 * content type — the Socials page's content-performance chart. Categorical
 * X axis (content_type), unlike every other chart in this file (date-based,
 * via formatDay), so this is its own component rather than a StackedActions/
 * SignupsChart variant: forcing a category axis through `formatDay` would
 * just throw on a non-ISO-date string. Same dual-left/right-axis idea as
 * SignupsChart (two metrics on genuinely different scales — a view count vs.
 * a percentage — sharing one X axis without inventing a false correlation
 * via a shared Y). */
export function ContentPerformanceChart({
  data,
}: {
  data: { content_type: string; label: string; avgViews: number; avgEngagementRate: number }[];
}) {
  const viewsMax = data.reduce((m, r) => Math.max(m, r.avgViews), 0);
  const viewsTicks = niceTicks(viewsMax);
  const engagementMax = data.reduce((m, r) => Math.max(m, r.avgEngagementRate), 0);
  const engagementTicks = niceTicks(engagementMax);

  const series: Series[] = [
    { key: "avgViews", label: "Avg views", color: "var(--series-avg-views)" },
    { key: "avgEngagementRate", label: "Avg engagement %", color: "var(--series-avg-engagement)" },
  ];

  return (
    <div className="w-full">
      <LegendRow series={series} />
      <div className="h-52 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid stroke="var(--color-line)" vertical={false} strokeDasharray="0" />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 10, fill: "var(--color-faint)" }}
              axisLine={false}
              tickLine={false}
              interval={0}
            />
            <YAxis
              yAxisId="left"
              tick={{ fontSize: 10, fill: "var(--color-faint)" }}
              axisLine={false}
              tickLine={false}
              width={32}
              allowDecimals={false}
              domain={[0, viewsTicks[viewsTicks.length - 1]]}
            />
            <YAxis
              yAxisId="right"
              orientation="right"
              tick={{ fontSize: 10, fill: "var(--color-faint)" }}
              axisLine={false}
              tickLine={false}
              width={32}
              domain={[0, engagementTicks[engagementTicks.length - 1]]}
            />
            <Tooltip
              content={
                <MultiTooltip
                  series={[
                    { key: "avgViews", label: "Avg views", color: "var(--series-avg-views)" },
                    { key: "avgEngagementRate", label: "Avg engagement", color: "var(--series-avg-engagement)" },
                  ]}
                  suffix=""
                />
              }
              cursor={{ fill: "var(--color-line)", fillOpacity: 0.3 }}
            />
            <Bar yAxisId="left" dataKey="avgViews" fill="var(--series-avg-views)" radius={[3, 3, 0, 0]} maxBarSize={28} />
            <Bar
              yAxisId="right"
              dataKey="avgEngagementRate"
              fill="var(--series-avg-engagement)"
              radius={[3, 3, 0, 0]}
              maxBarSize={28}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
