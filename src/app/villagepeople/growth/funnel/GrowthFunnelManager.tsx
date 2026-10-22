"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getGrowthFunnel, apiErrorMessage, type GrowthFunnelResult } from "@/lib/growthApi";
import { computeRange, type DateRange } from "@/lib/growthRange";
import { GrowthControls, type GrowthControlsValue } from "@/components/villagepeople/GrowthControls";
import { FunnelBars, type FunnelStepDatum } from "@/components/villagepeople/FunnelBars";
import { FunnelIconFill, PendingIconFill } from "@/components/ui/icons";

/**
 * /villagepeople/growth/funnel — content_views -> clicks -> signups ->
 * activated -> retained_day7. `growth-funnel` takes no `compare` and has no
 * per-campus breakdown, so both GrowthControls toggles are hidden, same
 * reasoning as every other non-compare/non-campus page in this section.
 * `weakestStep` (the backend's own assumption-gap pick, not just "the step
 * with the lowest conversionFromPrevPct" — see stats.repo.ts's own doc
 * comment on getGrowthFunnel) gets the FunnelBars `warning` treatment plus
 * a called-out banner, so it's unmissable rather than just a slightly
 * different-colored bar in a five-bar list.
 */
export function GrowthFunnelManager() {
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

  const [funnel, setFunnel] = useState<GrowthFunnelResult | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadGenRef = useRef(0);
  const load = useCallback(() => {
    const gen = ++loadGenRef.current;
    setLoading(true);
    setError(null);
    getGrowthFunnel(range)
      .then((res) => {
        if (gen !== loadGenRef.current) return;
        setFunnel(res);
        setLastUpdated(new Date().toISOString());
      })
      .catch((err) => {
        if (gen !== loadGenRef.current) return;
        setError(apiErrorMessage(err, "Couldn't load the growth funnel"));
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

  const weakestStepLabel = funnel?.steps.find((s) => s.step === funnel.weakestStep)?.label ?? null;

  const funnelSteps: FunnelStepDatum[] =
    funnel?.steps.map((s) => ({
      key: s.step,
      label: s.label,
      count: s.count,
      pctLabel: s.conversionFromPrevPct == null ? "–" : `${s.conversionFromPrevPct}%`,
      warning: s.step === funnel.weakestStep,
    })) ?? [];

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-6 py-10 md:px-10">
      <div>
        <h1 className="flex items-center gap-2 font-nunito text-2xl font-extrabold text-ink">
          <FunnelIconFill className="h-6 w-6 text-brand" weight="fill" />
          Growth funnel
        </h1>
        <p className="mt-1 font-nunito text-sm text-muted">
          Content views through to day-7 retention, and where the biggest gap against plan is.
        </p>
      </div>

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

      {weakestStepLabel && (
        <p className="flex items-center gap-2 rounded-2xl border border-danger/30 bg-danger/5 p-4 font-nunito text-sm font-semibold text-danger">
          <PendingIconFill className="h-4 w-4 shrink-0" weight="fill" />
          Weakest link in the funnel: <span className="font-extrabold">{weakestStepLabel}</span> — furthest below plan.
        </p>
      )}

      <section className="rounded-2xl border border-line/70 p-4">
        <h2 className="mb-3 font-nunito text-sm font-bold text-ink">Content views → day-7 retention</h2>
        {funnelSteps.length === 0 ? (
          <p className="py-8 text-center font-nunito text-xs text-faint">No funnel data in this range.</p>
        ) : (
          <FunnelBars steps={funnelSteps} />
        )}
      </section>

      {loading && <p className="text-center font-nunito text-xs text-faint">Loading…</p>}
    </div>
  );
}
