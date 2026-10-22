"use client";

import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { getSchoolsBreakdown, apiErrorMessage, type SchoolBreakdownRow } from "@/lib/growthApi";
import { computeRange, type DateRange } from "@/lib/growthRange";
import { GrowthControls, type GrowthControlsValue } from "@/components/villagepeople/GrowthControls";
import { CampusIconFill, CaretDownIconFill } from "@/components/ui/icons";

type SortKey = keyof Pick<
  SchoolBreakdownRow,
  "campusName" | "totalUsers" | "dau" | "mau" | "stickiness" | "postsPerDayAvg" | "day7Retention" | "newSignups"
>;

const COLUMNS: { key: SortKey; label: string }[] = [
  { key: "campusName", label: "Campus" },
  { key: "totalUsers", label: "Total users" },
  { key: "dau", label: "DAU" },
  { key: "mau", label: "MAU" },
  { key: "stickiness", label: "Stickiness" },
  { key: "postsPerDayAvg", label: "Posts/day" },
  { key: "day7Retention", label: "Day-7 retention" },
  { key: "newSignups", label: "New signups" },
];

/** "Active" here means MAU — the standard monthly-active-users read of
 * "active," and the one metric on this table that's genuinely about
 * ongoing engagement rather than a one-time count (totalUsers) or a
 * single-day snapshot (dau). <50 MAU = cold, >=300 MAU = alive, per spec. */
function activityBadge(mau: number): { label: string; className: string } | null {
  if (mau < 50) return { label: "Cold", className: "bg-line/20 text-faint" };
  if (mau >= 300) return { label: "Alive", className: "bg-success/15 text-success" };
  return null;
}

export function SchoolsManager() {
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
  const [rows, setRows] = useState<SchoolBreakdownRow[]>([]);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("mau");
  const [sortDesc, setSortDesc] = useState(true);

  const loadGenRef = useRef(0);
  const load = useCallback(() => {
    const gen = ++loadGenRef.current;
    setLoading(true);
    setError(null);
    getSchoolsBreakdown(range, controls.compare)
      .then((env) => {
        if (gen !== loadGenRef.current) return;
        setRows(env.current);
        setLastUpdated(new Date().toISOString());
      })
      .catch((err) => {
        if (gen !== loadGenRef.current) return;
        setError(apiErrorMessage(err, "Couldn't load the schools breakdown"));
      })
      .finally(() => {
        if (gen === loadGenRef.current) setLoading(false);
      });
  }, [range, controls.compare]);

  // Deferred via setTimeout — see GrowthDashboardClient.tsx's own doc
  // comment on why (keeps this off react-hooks/set-state-in-effect).
  useEffect(() => {
    const timer = setTimeout(load, 0);
    return () => clearTimeout(timer);
  }, [load]);

  const toggleSort = (key: SortKey) => {
    if (key === sortKey) setSortDesc((d) => !d);
    else {
      setSortKey(key);
      setSortDesc(true);
    }
  };

  const filtered = controls.campusTags.length > 0 ? rows.filter((r) => controls.campusTags.includes(r.campusTag)) : rows;
  const sorted = [...filtered].sort((a, b) => {
    const av = a[sortKey];
    const bv = b[sortKey];
    const an = av == null ? -Infinity : typeof av === "string" ? av : av;
    const bn = bv == null ? -Infinity : typeof bv === "string" ? bv : bv;
    const cmp = typeof an === "string" && typeof bn === "string" ? an.localeCompare(bn) : Number(an) - Number(bn);
    return sortDesc ? -cmp : cmp;
  });

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-10 md:px-10">
      <div>
        <h1 className="flex items-center gap-2 font-nunito text-2xl font-extrabold text-ink">
          <CampusIconFill className="h-6 w-6 text-brand" weight="fill" />
          Schools
        </h1>
        <p className="mt-1 font-nunito text-sm text-muted">
          Per-campus growth. Tap a column to sort. <span className="font-semibold text-faint">Cold</span> = under 50
          MAU, <span className="font-semibold text-success">alive</span> = 300+ MAU.
        </p>
      </div>

      <GrowthControls value={controls} onChange={setControls} lastUpdated={lastUpdated} onRefresh={load} />

      {error && (
        <p className="rounded-2xl border border-dashed border-danger/40 bg-danger/5 p-4 text-center font-nunito text-sm text-danger">
          {error}
        </p>
      )}

      <div className="overflow-x-auto rounded-2xl border border-line/70">
        <table className="w-full min-w-[760px] border-collapse">
          <thead>
            <tr className="border-b border-line/70 bg-line/10">
              {COLUMNS.map((col) => (
                <th key={col.key} className="px-3 py-2.5 text-left font-nunito text-xs font-bold text-muted">
                  <button type="button" onClick={() => toggleSort(col.key)} className="flex items-center gap-1 hover:text-brand">
                    {col.label}
                    {sortKey === col.key && (
                      <CaretDownIconFill className={`h-3 w-3 transition ${sortDesc ? "" : "rotate-180"}`} weight="fill" />
                    )}
                  </button>
                </th>
              ))}
              <th className="px-3 py-2.5 text-left font-nunito text-xs font-bold text-muted">Status</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((r) => {
              const badge = activityBadge(r.mau);
              return (
                <tr key={r.campusTag} className="border-b border-line/40 last:border-0 hover:bg-brand/5">
                  <td className="px-3 py-2 font-nunito text-xs font-semibold text-ink">{r.campusName}</td>
                  <td className="px-3 py-2 font-nunito text-xs text-ink">{r.totalUsers.toLocaleString()}</td>
                  <td className="px-3 py-2 font-nunito text-xs text-ink">{r.dau.toLocaleString()}</td>
                  <td className="px-3 py-2 font-nunito text-xs text-ink">{r.mau.toLocaleString()}</td>
                  <td className="px-3 py-2 font-nunito text-xs text-ink">{r.stickiness == null ? "–" : `${r.stickiness}%`}</td>
                  <td className="px-3 py-2 font-nunito text-xs text-ink">{r.postsPerDayAvg}</td>
                  <td className="px-3 py-2 font-nunito text-xs text-ink">{r.day7Retention == null ? "–" : `${r.day7Retention}%`}</td>
                  <td className="px-3 py-2 font-nunito text-xs text-ink">{r.newSignups.toLocaleString()}</td>
                  <td className="px-3 py-2">
                    {badge && (
                      <span className={`rounded-full px-2 py-0.5 font-nunito text-[11px] font-bold ${badge.className}`}>
                        {badge.label}
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {sorted.length === 0 && !loading && (
        <p className="rounded-2xl border border-dashed border-line/70 p-6 text-center font-nunito text-sm text-muted">
          No campuses match.
        </p>
      )}
      {loading && <p className="text-center font-nunito text-xs text-faint">Loading…</p>}
    </div>
  );
}
