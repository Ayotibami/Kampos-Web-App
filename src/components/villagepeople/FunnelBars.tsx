"use client";

/**
 * Plain proportional-width bar funnel — shared by the Activation page's
 * onboarding funnel (signed up -> ... -> first post) and the Growth Funnel
 * page's content-views -> retained-day7 funnel. Deliberately not a Recharts
 * component like GrowthCharts.tsx's family: a funnel here is just "N bars,
 * each width proportional to its own count against the largest step," which
 * plain divs render more simply (and more readably at small widths) than
 * coercing a FunnelChart/BarChart into the same shape.
 */
export interface FunnelStepDatum {
  key: string;
  label: string;
  count: number;
  /** Secondary percentage badge next to the bar — meaning differs per
   * caller (drop-off from the previous step vs. conversion from the
   * previous step), so the caller passes the already-formatted text
   * rather than this component guessing which framing to use. */
  pctLabel?: string | null;
  /** Danger styling for a step that's a known weak point (e.g. the Growth
   * Funnel page's `weakestStep`) — red bar + red percentage instead of the
   * default brand color. */
  warning?: boolean;
}

export function FunnelBars({ steps }: { steps: FunnelStepDatum[] }) {
  const max = steps.reduce((m, s) => Math.max(m, s.count), 0) || 1;

  return (
    <div className="flex flex-col gap-2.5">
      {steps.map((s) => {
        const widthPct = Math.max(6, Math.round((s.count / max) * 100));
        return (
          <div key={s.key} className="flex items-center gap-2.5 sm:gap-3">
            <div className="w-20 shrink-0 font-nunito text-[11px] font-semibold leading-tight text-ink sm:w-32 sm:text-xs">
              {s.label}
            </div>
            <div className="relative h-8 flex-1 overflow-hidden rounded-lg bg-line/10">
              <div
                className={`h-full rounded-lg transition-all ${s.warning ? "bg-danger" : "bg-brand"}`}
                style={{ width: `${widthPct}%` }}
              />
              <div className="absolute inset-0 flex items-center px-2.5 font-nunito text-[11px] font-bold text-ink sm:text-xs">
                {s.count.toLocaleString()}
              </div>
            </div>
            {s.pctLabel != null && (
              <div
                className={`w-14 shrink-0 text-right font-nunito text-[11px] font-bold sm:w-16 ${
                  s.warning ? "text-danger" : "text-faint"
                }`}
              >
                {s.pctLabel}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
