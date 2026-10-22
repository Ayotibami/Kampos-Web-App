"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  getActivationRate,
  getActivationFunnel,
  getActivationTimeToFirstAction,
  getAmeboFirstSessionRate,
  apiErrorMessage,
  type ActivationRate,
  type ActivationFunnelStep,
  type TimeToFirstAction,
  type AmeboFirstSessionRate,
} from "@/lib/growthApi";
import { computeRange, type DateRange } from "@/lib/growthRange";
import { GrowthControls, type GrowthControlsValue } from "@/components/villagepeople/GrowthControls";
import { StatCard } from "../../HqDashboard";
import { FunnelBars, type FunnelStepDatum } from "@/components/villagepeople/FunnelBars";
import { ActivationIconFill, TimeToActionIconFill, AnonymousIconFill } from "@/components/ui/icons";
import { formatHours } from "@/lib/format";

/**
 * /villagepeople/growth/activation — onboarding funnel + the two activation
 * side-metrics (time-to-first-action, amebo-first-session-rate). The
 * activation-RATE stat card deliberately calls the exact same
 * `getActivationRate` wrapper the rest of the codebase has had defined
 * (but, per a repo-wide check, never actually rendered anywhere) since
 * GrowthDashboardClient.tsx/RetentionManager.tsx never ended up using it —
 * this page is the single place that number now appears, not a second,
 * independently-computed version of it.
 *
 * None of activation-funnel/activation-time-to-first-action/
 * amebo-first-session-rate/activation-rate's OWN comparison-free siblings
 * take `compare`, and none has a per-campus breakdown, so both controls are
 * hidden here — same reasoning TopListsManager/RetentionManager's heatmap
 * section already document for their own endpoints.
 */
export function ActivationManager() {
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

  const [activationRate, setActivationRate] = useState<ActivationRate | null>(null);
  const [funnel, setFunnel] = useState<ActivationFunnelStep[]>([]);
  const [timeToFirstAction, setTimeToFirstAction] = useState<TimeToFirstAction | null>(null);
  const [amebo, setAmebo] = useState<AmeboFirstSessionRate | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadGenRef = useRef(0);
  const load = useCallback(() => {
    const gen = ++loadGenRef.current;
    setLoading(true);
    setError(null);
    Promise.all([
      getActivationRate(range, false),
      getActivationFunnel(range),
      getActivationTimeToFirstAction(range),
      getAmeboFirstSessionRate(range),
    ])
      .then(([rateEnv, funnelRes, timeRes, ameboRes]) => {
        if (gen !== loadGenRef.current) return;
        setActivationRate(rateEnv.current);
        setFunnel(funnelRes);
        setTimeToFirstAction(timeRes);
        setAmebo(ameboRes);
        setLastUpdated(new Date().toISOString());
      })
      .catch((err) => {
        if (gen !== loadGenRef.current) return;
        setError(apiErrorMessage(err, "Couldn't load activation data"));
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

  const funnelSteps: FunnelStepDatum[] = funnel.map((s) => ({
    key: s.step,
    label: s.label,
    count: s.count,
    pctLabel: s.dropoffFromPrevPct == null ? "–" : `-${s.dropoffFromPrevPct}%`,
  }));

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-6 py-10 md:px-10">
      <div>
        <h1 className="flex items-center gap-2 font-nunito text-2xl font-extrabold text-ink">
          <ActivationIconFill className="h-6 w-6 text-brand" weight="fill" />
          Activation
        </h1>
        <p className="mt-1 font-nunito text-sm text-muted">
          How many new signups actually get activated, and how long it takes them to take their first action.
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

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard
          icon={ActivationIconFill}
          label="Activation rate"
          value={activationRate?.pct ?? 0}
          displayValue={activationRate?.pct == null ? "–" : `${activationRate.pct}%`}
          breakdown={
            activationRate
              ? [
                  { label: "Signups", value: activationRate.signups },
                  { label: "Activated", value: activationRate.activated },
                ]
              : undefined
          }
        />
        <StatCard
          icon={TimeToActionIconFill}
          label="Avg time to first action"
          value={timeToFirstAction?.avgHours ?? 0}
          displayValue={timeToFirstAction?.avgHours == null ? "–" : formatHours(timeToFirstAction.avgHours)}
          breakdown={timeToFirstAction ? [{ label: "Sample size", value: timeToFirstAction.sampleSize }] : undefined}
        />
        <StatCard
          icon={AnonymousIconFill}
          label="Used Amebo in first hour"
          value={amebo?.pct ?? 0}
          displayValue={amebo?.pct == null ? "–" : `${amebo.pct}%`}
          breakdown={amebo ? [{ label: "Signups", value: amebo.signups }, { label: "Used it early", value: amebo.usedAmeboEarly }] : undefined}
        />
      </section>

      <section className="rounded-2xl border border-line/70 p-4">
        <h2 className="mb-3 font-nunito text-sm font-bold text-ink">Onboarding funnel</h2>
        {funnelSteps.length === 0 ? (
          <p className="py-8 text-center font-nunito text-xs text-faint">No signups in this range.</p>
        ) : (
          <FunnelBars steps={funnelSteps} />
        )}
      </section>

      {loading && <p className="text-center font-nunito text-xs text-faint">Loading…</p>}
    </div>
  );
}
