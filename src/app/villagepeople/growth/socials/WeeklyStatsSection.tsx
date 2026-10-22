"use client";

import { useEffect, useState } from "react";
import {
  listWeeklyStats,
  createWeeklyStat,
  updateWeeklyStat,
  deleteWeeklyStat,
  apiErrorMessage,
  type SocialWeeklyStatRow,
  type SocialWeeklyStatInput,
  type SocialPlatform,
} from "@/lib/growthApi";
import { Button } from "@/components/ui/Button";
import { TextInput } from "@/components/ui/TextInput";
import { Modal } from "@/components/ui/Modal";
import { ConfirmModal, ErrorModal, SuccessModal } from "@/components/ui/FeedbackModal";
import { Plus, EditIconFill, DeleteIconFill } from "@/components/ui/icons";

const PLATFORM_LABEL: Record<SocialPlatform, string> = {
  tiktok: "TikTok",
  instagram: "Instagram",
  x: "X",
  whatsapp_channel: "WhatsApp channel",
};

const NUMERIC_FIELDS: { key: keyof SocialWeeklyStatInput; label: string; optional?: boolean }[] = [
  { key: "follower_count", label: "Followers" },
  { key: "posts_published", label: "Posts published" },
  { key: "total_views", label: "Total views" },
  { key: "likes", label: "Likes" },
  { key: "comments", label: "Comments" },
  { key: "shares", label: "Shares" },
  { key: "saves", label: "Saves" },
  { key: "link_clicks", label: "Link clicks", optional: true },
];

const EMPTY_FORM: Record<string, string> = {
  week_starting: "",
  platform: "tiktok",
  follower_count: "",
  posts_published: "",
  total_views: "",
  likes: "",
  comments: "",
  shares: "",
  saves: "",
  link_clicks: "",
};

export function WeeklyStatsSection() {
  const [rows, setRows] = useState<SocialWeeklyStatRow[]>([]);
  const [loading, setLoading] = useState(true);

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<Record<string, string>>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const [deleting, setDeleting] = useState<SocialWeeklyStatRow | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const [errorMessage, setErrorMessage] = useState<string>();
  const [showError, setShowError] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string>();
  const [showSuccess, setShowSuccess] = useState(false);

  const fail = (msg: string) => {
    setErrorMessage(msg);
    setShowError(true);
  };
  const succeed = (msg: string) => {
    setSuccessMessage(msg);
    setShowSuccess(true);
  };

  const load = () => {
    setLoading(true);
    listWeeklyStats()
      .then(setRows)
      .catch((err) => fail(apiErrorMessage(err, "Couldn't load weekly stats")))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    const timer = setTimeout(load, 0);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openAdd = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setShowForm(true);
  };

  const openEdit = (row: SocialWeeklyStatRow) => {
    setEditingId(row.id);
    setForm({
      week_starting: row.week_starting.slice(0, 10),
      platform: row.platform,
      follower_count: String(row.follower_count),
      posts_published: String(row.posts_published),
      total_views: String(row.total_views),
      likes: String(row.likes),
      comments: String(row.comments),
      shares: String(row.shares),
      saves: String(row.saves),
      link_clicks: row.link_clicks != null ? String(row.link_clicks) : "",
    });
    setShowForm(true);
  };

  const REQUIRED_NUMERIC_FIELDS: { key: keyof typeof form; label: string }[] = [
    { key: "follower_count", label: "Follower count" },
    { key: "posts_published", label: "Posts published" },
    { key: "total_views", label: "Total views" },
    { key: "likes", label: "Likes" },
    { key: "comments", label: "Comments" },
    { key: "shares", label: "Shares" },
    { key: "saves", label: "Saves" },
  ];

  const handleSave = async () => {
    if (!form.week_starting) return fail("Week starting date is required");
    // Blank numeric fields would otherwise sail through as Number("") === 0,
    // silently recording a zero for a field the admin just forgot to fill.
    for (const { key, label } of REQUIRED_NUMERIC_FIELDS) {
      if (form[key].trim() === "") return fail(`${label} is required`);
    }
    setSaving(true);
    try {
      const input: SocialWeeklyStatInput = {
        week_starting: form.week_starting,
        platform: form.platform as SocialPlatform,
        follower_count: Number(form.follower_count),
        posts_published: Number(form.posts_published),
        total_views: Number(form.total_views),
        likes: Number(form.likes),
        comments: Number(form.comments),
        shares: Number(form.shares),
        saves: Number(form.saves),
        link_clicks: form.link_clicks.trim() ? Number(form.link_clicks) : null,
      };
      if (editingId) {
        await updateWeeklyStat(editingId, input);
        succeed("Weekly stat updated.");
      } else {
        await createWeeklyStat(input);
        succeed("Weekly stat added.");
      }
      setShowForm(false);
      load();
    } catch (err) {
      fail(apiErrorMessage(err, "Failed to save weekly stat"));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleting) return;
    setDeleteBusy(true);
    try {
      await deleteWeeklyStat(deleting.id);
      setRows((prev) => prev.filter((r) => r.id !== deleting.id));
      setDeleting(null);
      succeed("Weekly stat deleted.");
    } catch (err) {
      fail(apiErrorMessage(err, "Failed to delete weekly stat"));
      setDeleting(null);
    } finally {
      setDeleteBusy(false);
    }
  };

  return (
    <section className="flex flex-col gap-3">
      <ErrorModal open={showError} onClose={() => setShowError(false)} message={errorMessage} />
      <SuccessModal open={showSuccess} onClose={() => setShowSuccess(false)} message={successMessage} />
      <ConfirmModal
        open={!!deleting}
        onClose={() => (deleteBusy ? undefined : setDeleting(null))}
        onConfirm={handleDelete}
        title="Delete this entry?"
        message="This can't be undone."
        confirmLabel="Delete"
        loading={deleteBusy}
        icon={<DeleteIconFill size={24} weight="fill" />}
      />

      <Modal open={showForm} onClose={() => (saving ? undefined : setShowForm(false))}>
        <div className="max-h-[85vh] overflow-y-auto rounded-3xl bg-surface p-5 shadow-2xl">
          <p className="mb-4 font-nunito text-sm font-bold text-ink">{editingId ? "Edit" : "Add"} weekly stat</p>
          <div className="flex flex-col gap-3">
            <label className="block w-full">
              <span className="mb-1.5 block font-nunito text-sm text-muted">Week starting</span>
              <input
                type="date"
                value={form.week_starting}
                onChange={(e) => setForm((f) => ({ ...f, week_starting: e.target.value }))}
                className="w-full rounded-2xl border border-line bg-surface-2 px-4 py-3.5 font-nunito text-sm text-ink outline-none focus:border-brand"
              />
            </label>
            <label className="block w-full">
              <span className="mb-1.5 block font-nunito text-sm text-muted">Platform</span>
              <select
                value={form.platform}
                onChange={(e) => setForm((f) => ({ ...f, platform: e.target.value }))}
                className="w-full rounded-2xl border border-line bg-surface-2 px-4 py-3.5 font-nunito text-sm text-ink outline-none focus:border-brand"
              >
                {Object.entries(PLATFORM_LABEL).map(([k, label]) => (
                  <option key={k} value={k}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            {NUMERIC_FIELDS.map((f) => (
              <TextInput
                key={f.key}
                value={form[f.key] ?? ""}
                onChange={(v) => setForm((prev) => ({ ...prev, [f.key]: v }))}
                placeholder={f.label + (f.optional ? " (optional)" : "")}
                type="number"
                inputMode="numeric"
                autoComplete="off"
              />
            ))}
          </div>
          <div className="mt-4 flex gap-2">
            <Button variant="secondary" className="flex-1" onClick={() => setShowForm(false)} disabled={saving}>
              Cancel
            </Button>
            <Button className="flex-1" loading={saving} onClick={handleSave}>
              Save
            </Button>
          </div>
        </div>
      </Modal>

      <div className="flex items-center justify-between">
        <h2 className="font-nunito text-sm font-bold text-ink">Weekly stats {rows.length > 0 && `(${rows.length})`}</h2>
        <Button variant="secondary" fullWidth={false} className="!px-3.5 !py-1.5 text-xs" onClick={openAdd}>
          <Plus className="h-3.5 w-3.5" />
          Add
        </Button>
      </div>

      {loading ? (
        <p className="text-center font-nunito text-xs text-faint">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-line/70 p-6 text-center font-nunito text-sm text-muted">None yet.</p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-line/70">
          <table className="w-full min-w-[720px] border-collapse">
            <thead>
              <tr className="border-b border-line/70 bg-line/10">
                {["Week", "Platform", "Followers", "Posts", "Views", "Likes", "Comments", "Shares", "Saves", ""].map((h) => (
                  <th key={h} className="px-2.5 py-2 text-left font-nunito text-[11px] font-bold text-muted">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-line/40 last:border-0">
                  <td className="px-2.5 py-2 font-nunito text-xs text-ink">{r.week_starting.slice(0, 10)}</td>
                  <td className="px-2.5 py-2 font-nunito text-xs text-ink">{PLATFORM_LABEL[r.platform]}</td>
                  <td className="px-2.5 py-2 font-nunito text-xs text-ink">{r.follower_count.toLocaleString()}</td>
                  <td className="px-2.5 py-2 font-nunito text-xs text-ink">{r.posts_published}</td>
                  <td className="px-2.5 py-2 font-nunito text-xs text-ink">{r.total_views.toLocaleString()}</td>
                  <td className="px-2.5 py-2 font-nunito text-xs text-ink">{r.likes.toLocaleString()}</td>
                  <td className="px-2.5 py-2 font-nunito text-xs text-ink">{r.comments.toLocaleString()}</td>
                  <td className="px-2.5 py-2 font-nunito text-xs text-ink">{r.shares.toLocaleString()}</td>
                  <td className="px-2.5 py-2 font-nunito text-xs text-ink">{r.saves.toLocaleString()}</td>
                  <td className="px-2.5 py-2">
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => openEdit(r)}
                        aria-label="Edit"
                        className="flex h-7 w-7 items-center justify-center rounded-full text-muted hover:bg-brand/10 hover:text-brand"
                      >
                        <EditIconFill className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleting(r)}
                        aria-label="Delete"
                        className="flex h-7 w-7 items-center justify-center rounded-full text-danger hover:bg-danger/10"
                      >
                        <DeleteIconFill className="h-3.5 w-3.5" weight="fill" />
                      </button>
                    </div>
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
