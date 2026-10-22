"use client";

import { useEffect, useState } from "react";
import {
  getTargetsVsActuals,
  upsertTarget,
  apiErrorMessage,
  type TargetVsActual,
  type TargetType,
} from "@/lib/growthApi";
import { Button } from "@/components/ui/Button";
import { TextInput } from "@/components/ui/TextInput";
import { Modal } from "@/components/ui/Modal";
import { ErrorModal, SuccessModal } from "@/components/ui/FeedbackModal";
import { TargetIconFill, EditIconFill } from "@/components/ui/icons";

const FROM_MONTH = "2026-10";
const TO_MONTH = "2027-03";

/** Every known computable KPI (see stats.repo.ts's own `COMPUTABLE_KPI_KEYS`
 * doc comment) — shown even with no target set yet, so there's always a
 * cell to click into. A target for any OTHER kpi_key (one owned by Korner or
 * the socials module, which this backend can't compute an actual for) still
 * shows up as its own extra row below if one exists in the data — this list
 * just guarantees the backend-computable rows are never missing. */
const KPI_DEFS: { key: string; label: string; defaultType: TargetType; format: (v: number) => string }[] = [
  { key: "kampos_signups", label: "Kampos signups", defaultType: "monthly_total", format: (v) => Math.round(v).toLocaleString() },
  { key: "mau", label: "MAU", defaultType: "point_in_time", format: (v) => Math.round(v).toLocaleString() },
  { key: "dau", label: "DAU (avg)", defaultType: "daily_average", format: (v) => v.toFixed(1) },
  { key: "dau_mau_ratio", label: "DAU/MAU ratio", defaultType: "daily_average", format: (v) => `${v.toFixed(1)}%` },
  { key: "day7_retention", label: "Day-7 retention", defaultType: "point_in_time", format: (v) => `${v.toFixed(1)}%` },
  { key: "posts_per_day", label: "Posts/day", defaultType: "daily_average", format: (v) => v.toFixed(1) },
];

function monthsBetween(fromMonth: string, toMonth: string): string[] {
  const [fy, fm] = fromMonth.split("-").map(Number);
  const [ty, tm] = toMonth.split("-").map(Number);
  const out: string[] = [];
  let y = fy;
  let m = fm;
  while (y < ty || (y === ty && m <= tm)) {
    out.push(`${y}-${String(m).padStart(2, "0")}-01`);
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return out;
}

function monthLabel(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString(undefined, { month: "short", year: "numeric", timeZone: "UTC" });
}

const STATUS_STYLE: Record<string, string> = {
  green: "bg-success/15 text-success",
  amber: "bg-warning/15 text-warning",
  red: "bg-danger/15 text-danger",
};

export function TargetsManager() {
  const months = monthsBetween(FROM_MONTH, TO_MONTH);
  const [rows, setRows] = useState<TargetVsActual[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [editing, setEditing] = useState<{ month: string; kpiKey: string } | null>(null);
  const [editValue, setEditValue] = useState("");
  const [editType, setEditType] = useState<TargetType>("monthly_total");
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string>();
  const [showError, setShowError] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);

  const load = () => {
    setLoading(true);
    setError(null);
    getTargetsVsActuals(FROM_MONTH, TO_MONTH)
      .then(setRows)
      .catch((err) => setError(apiErrorMessage(err, "Couldn't load targets")))
      .finally(() => setLoading(false));
  };

  // Deferred via setTimeout — see GrowthDashboardClient.tsx's own doc
  // comment on why (keeps this off react-hooks/set-state-in-effect).
  useEffect(() => {
    const timer = setTimeout(load, 0);
    return () => clearTimeout(timer);
  }, []);

  const byKpiMonth = new Map<string, TargetVsActual>();
  for (const r of rows) byKpiMonth.set(`${r.kpi_key}:${r.month}`, r);

  const extraKpiKeys = Array.from(new Set(rows.map((r) => r.kpi_key))).filter(
    (k) => !KPI_DEFS.some((d) => d.key === k)
  );
  const allRowDefs = [
    ...KPI_DEFS,
    ...extraKpiKeys.map((k) => ({ key: k, label: k, defaultType: "monthly_total" as TargetType, format: (v: number) => v.toLocaleString() })),
  ];

  const openEdit = (month: string, kpiKey: string) => {
    const existing = byKpiMonth.get(`${kpiKey}:${month}`);
    const def = allRowDefs.find((d) => d.key === kpiKey);
    setEditValue(existing?.target != null ? String(existing.target) : "");
    setEditType(def?.defaultType ?? "monthly_total");
    setEditing({ month, kpiKey });
  };

  const handleSave = async () => {
    if (!editing) return;
    const numeric = Number(editValue);
    if (!Number.isFinite(numeric)) {
      setErrorMessage("Enter a valid number");
      setShowError(true);
      return;
    }
    setSaving(true);
    try {
      await upsertTarget({ month: editing.month, kpi_key: editing.kpiKey, target_value: numeric, type: editType });
      setEditing(null);
      setShowSuccess(true);
      load();
    } catch (err) {
      setErrorMessage(apiErrorMessage(err, "Failed to save target"));
      setShowError(true);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-10 md:px-10">
      <ErrorModal open={showError} onClose={() => setShowError(false)} message={errorMessage} />
      <SuccessModal open={showSuccess} onClose={() => setShowSuccess(false)} message="Target saved." />

      <Modal open={!!editing} onClose={() => (saving ? undefined : setEditing(null))}>
        <div className="rounded-3xl bg-surface p-5 shadow-2xl">
          <p className="mb-1 font-nunito text-sm font-bold text-ink">
            {editing && (allRowDefs.find((d) => d.key === editing.kpiKey)?.label ?? editing.kpiKey)}
          </p>
          <p className="mb-4 font-nunito text-xs text-faint">{editing && monthLabel(editing.month)}</p>
          <div className="flex flex-col gap-3">
            <TextInput value={editValue} onChange={setEditValue} placeholder="Target value" inputMode="decimal" autoComplete="off" />
            <select
              value={editType}
              onChange={(e) => setEditType(e.target.value as TargetType)}
              className="w-full rounded-2xl border border-line bg-surface-2 px-4 py-3.5 font-nunito text-sm text-ink outline-none focus:border-brand"
            >
              <option value="cumulative">Cumulative</option>
              <option value="point_in_time">Point in time</option>
              <option value="monthly_total">Monthly total</option>
              <option value="daily_average">Daily average</option>
            </select>
          </div>
          <div className="mt-4 flex gap-2">
            <Button variant="secondary" className="flex-1" onClick={() => setEditing(null)} disabled={saving}>
              Cancel
            </Button>
            <Button className="flex-1" loading={saving} disabled={!editValue.trim()} onClick={handleSave}>
              Save
            </Button>
          </div>
        </div>
      </Modal>

      <div>
        <h1 className="flex items-center gap-2 font-nunito text-2xl font-extrabold text-ink">
          <TargetIconFill className="h-6 w-6 text-brand" weight="fill" />
          Targets tracker
        </h1>
        <p className="mt-1 font-nunito text-sm text-muted">
          Oct 2026 – Mar 2027. Click a cell to set or edit its target. Green/amber/red reflects how the actual
          compares against the target the backend already computed.
        </p>
      </div>

      {error && (
        <p className="rounded-2xl border border-dashed border-danger/40 bg-danger/5 p-4 text-center font-nunito text-sm text-danger">
          {error}
        </p>
      )}

      <div className="overflow-x-auto rounded-2xl border border-line/70">
        <table className="w-full min-w-[720px] border-collapse">
          <thead>
            <tr className="border-b border-line/70 bg-line/10">
              <th className="sticky left-0 bg-line/10 px-3 py-2.5 text-left font-nunito text-xs font-bold text-muted">KPI</th>
              {months.map((m) => (
                <th key={m} className="px-3 py-2.5 text-center font-nunito text-xs font-bold text-muted">
                  {monthLabel(m)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {allRowDefs.map((def) => (
              <tr key={def.key} className="border-b border-line/50 last:border-0">
                <td className="sticky left-0 bg-surface px-3 py-2.5 font-nunito text-xs font-semibold text-ink">{def.label}</td>
                {months.map((m) => {
                  const row = byKpiMonth.get(`${def.key}:${m}`);
                  const hasTarget = row?.target != null;
                  return (
                    <td key={m} className="px-2 py-1.5 text-center">
                      <button
                        type="button"
                        onClick={() => openEdit(m, def.key)}
                        className={`group inline-flex min-w-[76px] flex-col items-center gap-0.5 rounded-xl px-2 py-1.5 font-nunito transition hover:ring-2 hover:ring-brand/30 ${
                          row?.status ? STATUS_STYLE[row.status] : "bg-line/10 text-faint"
                        }`}
                      >
                        <span className="text-xs font-extrabold">
                          {row?.actual != null ? def.format(row.actual) : "–"}
                        </span>
                        <span className="flex items-center gap-1 text-[10px] opacity-70">
                          {hasTarget ? `target ${def.format(row!.target!)}` : "set target"}
                          <EditIconFill className="h-2.5 w-2.5 opacity-0 transition group-hover:opacity-100" />
                        </span>
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {loading && <p className="text-center font-nunito text-xs text-faint">Loading…</p>}
    </div>
  );
}
