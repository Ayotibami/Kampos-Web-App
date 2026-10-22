"use client";

import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import {
  getDayNRetention,
  getRetentionCohorts,
  getActivityHeatmap,
  apiErrorMessage,
  type DayNRetention,
  type RetentionCohort,
  type HeatmapCell,
} from "@/lib/growthApi";
import { computeRange, type DateRange } from "@/lib/growthRange";
import { GrowthControls, type GrowthControlsValue } from "@/components/villagepeople/GrowthControls";
import { StatCard } from "../../HqDashboard";
import { RetentionIconFill, HeatmapIconFill } from "@/components/ui/icons";

const DOW_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const WEEK_INDEXES = Array.from({ length: 13 }, (_, i) => i);

function retentionCellStyle(pct: number | null): string {
  if (pct === null) return "bg-line/10 text-faint";
  // Darker/stronger brand tint the higher the retention — same "shade by
  // value" rule the heatmap below uses, just on the brand hue instead of a
  // neutral one, since this table's whole point IS the value (not a
  // secondary signal next to some other main metric).
  if (pct >= 50) return "bg-brand text-white";
  if (pct >= 30) return "bg-brand/60 text-white";
  if (pct >= 15) return "bg-brand/30 text-ink";
  if (pct > 0) return "bg-brand/15 text-ink";
  return "bg-line/15 text-faint";
}

function monthDay(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" });
}

export function RetentionManager() {
  const [dayN, setDayN] = useState<Record<1 | 7 | 30, DayNRetention | null>>({ 1: null, 7: null, 30: null });
  const [cohorts, setCohorts] = useState<RetentionCohort[]>([]);
  const [loadingTop, setLoadingTop] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [heatControls, setHeatControls] = useState<GrowthControlsValue>({
    rangeKey: "30d",
    customFrom: "",
    customTo: "",
    compare: false,
    campusTags: [],
  });
  const heatRange: DateRange = useMemo(
    () => computeRange(heatControls.rangeKey, { from: heatControls.customFrom, to: heatControls.customTo }),
    [heatControls.rangeKey, heatControls.customFrom, heatControls.customTo]
  );
  const [heatmap, setHeatmap] = useState<HeatmapCell[]>([]);
  const [heatUpdated, setHeatUpdated] = useState<string | null>(null);
  const [heatLoading, setHeatLoading] = useState(true);

  const loadTop = useCallback(() => {
    setLoadingTop(true);
    Promise.all([getDayNRetention(1), getDayNRetention(7), getDayNRetention(30)])
      .then(([d1, d7, d30]) => setDayN({ 1: d1, 7: d7, 30: d30 }))
      .catch((err) => setError(apiErrorMessage(err, "Couldn't load retention")))
      .finally(() => setLoadingTop(false));
    getRetentionCohorts()
      .then(setCohorts)
      .catch((err) => setError(apiErrorMessage(err, "Couldn't load cohorts")));
  }, []);

  // Deferred via setTimeout (not called synchronously in the effect body) —
  // same shape every other mount-triggered fetch in /villagepeople already
  // uses, which is what keeps this off the react-hooks/set-state-in-effect
  // lint rule (see GrowthDashboardClient.tsx's own doc comment on this).
  useEffect(() => {
    const timer = setTimeout(loadTop, 0);
    return () => clearTimeout(timer);
  }, [loadTop]);

  const heatmapGenRef = useRef(0);
  const loadHeatmap = useCallback(() => {
    const gen = ++heatmapGenRef.current;
    setHeatLoading(true);
    getActivityHeatmap(heatRange, heatControls.compare)
      .then((env) => {
        if (gen !== heatmapGenRef.current) return;
        setHeatmap(env.current);
        setHeatUpdated(new Date().toISOString());
      })
      .catch((err) => {
        if (gen !== heatmapGenRef.current) return;
        setError(apiErrorMessage(err, "Couldn't load the activity heatmap"));
      })
      .finally(() => {
        if (gen === heatmapGenRef.current) setHeatLoading(false);
      });
  }, [heatRange, heatControls.compare]);

  useEffect(() => {
    const timer = setTimeout(loadHeatmap, 0);
    return () => clearTimeout(timer);
  }, [loadHeatmap]);

  const heatMax = heatmap.reduce((m, c) => Math.max(m, c.count), 0);
  const cellAt = (dow: number, hour: number) => heatmap.find((c) => c.dayOfWeek === dow && c.hour === hour);

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-10 md:px-10">
      <div>
        <h1 className="flex items-center gap-2 font-nunito text-2xl font-extrabold text-ink">
          <RetentionIconFill className="h-6 w-6 text-brand" weight="fill" />
          Retention &amp; activity
        </h1>
        <p className="mt-1 font-nunito text-sm text-muted">
          How many people who sign up actually come back, and when the app is busiest.
        </p>
      </div>

      {error && (
        <p className="rounded-2xl border border-dashed border-danger/40 bg-danger/5 p-4 text-center font-nunito text-sm text-danger">
          {error}
        </p>
      )}

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {([1, 7, 30] as const).map((n) => (
          <StatCard
            key={n}
            icon={RetentionIconFill}
            label={`Day-${n} retention`}
            value={dayN[n]?.pct ?? 0}
            displayValue={dayN[n]?.pct == null ? "–" : `${dayN[n]!.pct}%`}
            breakdown={
              dayN[n]
                ? [
                    { label: "Cohort size", value: dayN[n]!.cohortSize },
                    { label: "Retained", value: dayN[n]!.activeCount },
                  ]
                : undefined
            }
          />
        ))}
      </section>
      {loadingTop && <p className="text-center font-nunito text-xs text-faint">Loading…</p>}

      <section>
        <h2 className="mb-3 font-nunito text-sm font-bold text-ink">Weekly cohort retention</h2>
        <div className="overflow-x-auto rounded-2xl border border-line/70">
          <table className="w-full min-w-[920px] border-collapse">
            <thead>
              <tr className="border-b border-line/70 bg-line/10">
                <th className="sticky left-0 bg-line/10 px-3 py-2 text-left font-nunito text-xs font-bold text-muted">Cohort week</th>
                <th className="px-2 py-2 text-center font-nunito text-xs font-bold text-muted">Size</th>
                {WEEK_INDEXES.map((w) => (
                  <th key={w} className="px-2 py-2 text-center font-nunito text-xs font-bold text-muted">
                    W{w}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {cohorts.map((c) => (
                <tr key={c.cohortWeekStart} className="border-b border-line/40 last:border-0">
                  <td className="sticky left-0 bg-surface px-3 py-1.5 font-nunito text-xs font-semibold text-ink">
                    {monthDay(c.cohortWeekStart)}
                  </td>
                  <td className="px-2 py-1.5 text-center font-nunito text-xs text-faint">{c.cohortSize}</td>
                  {WEEK_INDEXES.map((w) => {
                    const cell = c.weeks.find((x) => x.weekIndex === w);
                    return (
                      <td key={w} className="px-1 py-1">
                        <div className={`rounded-lg px-1.5 py-1 text-center font-nunito text-[11px] font-bold ${retentionCellStyle(cell?.pct ?? null)}`}>
                          {cell?.pct == null ? "–" : `${cell.pct}%`}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {cohorts.length === 0 && (
          <p className="mt-3 rounded-2xl border border-dashed border-line/70 p-6 text-center font-nunito text-sm text-muted">
            No cohort data yet.
          </p>
        )}
      </section>

      <section>
        <h2 className="mb-3 flex items-center gap-2 font-nunito text-sm font-bold text-ink">
          <HeatmapIconFill className="h-4 w-4 text-brand" weight="fill" />
          Activity heatmap
        </h2>
        <div className="mb-3">
          <GrowthControls
            value={heatControls}
            onChange={setHeatControls}
            lastUpdated={heatUpdated}
            onRefresh={loadHeatmap}
            showCampusFilter={false}
          />
        </div>
        <div className="overflow-x-auto rounded-2xl border border-line/70 p-3">
          <table className="border-collapse">
            <thead>
              <tr>
                <th className="w-10" />
                {Array.from({ length: 24 }, (_, h) => (
                  <th key={h} className="px-0.5 text-center font-nunito text-[9px] font-semibold text-faint">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {DOW_LABELS.map((label, dow) => (
                <tr key={dow}>
                  <td className="pr-2 text-right font-nunito text-[10px] font-semibold text-faint">{label}</td>
                  {Array.from({ length: 24 }, (_, hour) => {
                    const count = cellAt(dow, hour)?.count ?? 0;
                    const intensity = heatMax > 0 ? count / heatMax : 0;
                    return (
                      <td key={hour} className="p-[1.5px]">
                        <div
                          title={`${label} ${hour}:00 — ${count.toLocaleString()} events`}
                          className="h-4 w-4 rounded-[3px]"
                          style={{
                            backgroundColor: "var(--color-brand)",
                            opacity: intensity === 0 ? 0.06 : 0.15 + intensity * 0.85,
                          }}
                        />
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {heatLoading && <p className="mt-2 text-center font-nunito text-xs text-faint">Loading…</p>}
      </section>
    </div>
  );
}
