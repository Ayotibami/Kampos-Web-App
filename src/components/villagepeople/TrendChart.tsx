"use client";

import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

export interface TrendPoint {
  date: string; // "YYYY-MM-DD"
  count: number;
}

function formatDay(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/**
 * Clean, evenly-spaced integer ticks for the Y-axis (0, then round steps
 * up to the data max) — computed here rather than left to recharts' own
 * "nice tick" generator, which produced fractional steps like 0.7/1.4/2.1
 * on a small max-3 range that (at 10px) read as illegible, non-monotonic-
 * looking labels. Matches the dataviz skill's own rule: "Y-axis ticks:
 * round to clean numbers."
 */
function niceTicks(max: number, targetCount = 4): number[] {
  if (max <= 0) return [0, 1];
  const rawStep = max / targetCount;
  const magnitude = Math.pow(10, Math.floor(Math.log10(rawStep)));
  const residual = rawStep / magnitude;
  const step = Math.max(1, Math.round((residual > 5 ? 10 : residual > 2 ? 5 : residual > 1 ? 2 : 1) * magnitude));
  const ticks: number[] = [];
  for (let t = 0; t <= max; t += step) ticks.push(t);
  if (ticks[ticks.length - 1] < max) ticks.push(ticks[ticks.length - 1] + step);
  return ticks;
}

/** Value bold/primary, label secondary — the interaction spec's "values
 * lead, labels follow" (inverted from a legend's own hierarchy, since here
 * the reader already has the series and wants the number). Built as a
 * plain React element (never innerHTML), so a label can never inject markup. */
function ChartTooltip({ active, payload }: { active?: boolean; payload?: { value: number; payload: TrendPoint }[] }) {
  if (!active || !payload?.length) return null;
  const point = payload[0].payload;
  return (
    <div className="rounded-xl border border-line/70 bg-surface-2 px-3 py-2 shadow-lg">
      <p className="font-nunito text-sm font-extrabold text-ink">{point.count.toLocaleString()}</p>
      <p className="font-nunito text-[11px] text-muted">{formatDay(point.date)}</p>
    </div>
  );
}

/**
 * Single-series trend line — signups per day, gists posted per day. Each
 * metric gets its OWN chart rather than sharing one dual-axis plot: the two
 * differ wildly in scale (a handful of signups a day vs. dozens of gists),
 * and a dual y-axis chart invents a correlation that isn't really there
 * (the dataviz skill's own anti-pattern #1) — two single-axis charts side
 * by side are the honest version of "compare these trends."
 *
 * One series needs no legend box (the card's own title already names what's
 * plotted) — see the dataviz skill's marks-and-anatomy.md. Color is passed
 * in as a CSS color string (a literal hex, or a `var(--…)` the caller
 * defines in its own theme-scoped <style> block) so this component never
 * has to know which theme is active.
 */
export function TrendChart({ data, color }: { data: TrendPoint[]; color: string }) {
  const max = data.reduce((m, p) => Math.max(m, p.count), 0);
  const ticks = niceTicks(max);
  const domainMax = ticks[ticks.length - 1];

  return (
    <div className="h-40 w-full">
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
            width={28}
            allowDecimals={false}
            domain={[0, domainMax]}
            tickCount={ticks.length}
          />
          <Tooltip content={<ChartTooltip />} cursor={{ stroke: "var(--color-line)", strokeWidth: 1 }} />
          <Area
            type="monotone"
            dataKey="count"
            stroke={color}
            strokeWidth={2}
            fill={color}
            fillOpacity={0.1}
            dot={false}
            activeDot={{ r: 4, stroke: "var(--color-surface)", strokeWidth: 2, fill: color }}
            isAnimationActive
            animationDuration={900}
            animationEasing="ease-out"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
