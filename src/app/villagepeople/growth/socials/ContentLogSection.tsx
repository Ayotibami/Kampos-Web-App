"use client";

import { useEffect, useState } from "react";
import {
  listContentLog,
  createContentLog,
  updateContentLog,
  deleteContentLog,
  apiErrorMessage,
  type ContentLogRow,
  type ContentLogInput,
  type SocialPlatform,
  type ContentType,
} from "@/lib/growthApi";
import { Button } from "@/components/ui/Button";
import { TextInput } from "@/components/ui/TextInput";
import { Modal } from "@/components/ui/Modal";
import { ConfirmModal, ErrorModal, SuccessModal } from "@/components/ui/FeedbackModal";
import { Plus, EditIconFill, DeleteIconFill, LinkIconFill } from "@/components/ui/icons";

const PLATFORM_LABEL: Record<SocialPlatform, string> = {
  tiktok: "TikTok",
  instagram: "Instagram",
  x: "X",
  whatsapp_channel: "WhatsApp channel",
};

const CONTENT_TYPE_LABEL: Record<ContentType, string> = {
  product_talk: "Product talk",
  storytelling: "Storytelling",
  spotlight: "Spotlight",
  meme: "Meme",
  motion_design: "Motion design",
};

const EMPTY_FORM: Record<string, string> = {
  posted_at: "",
  platform: "tiktok",
  content_type: "product_talk",
  title: "",
  link: "",
  views: "",
  likes: "",
  comments: "",
  shares: "",
};

export function ContentLogSection() {
  const [rows, setRows] = useState<ContentLogRow[]>([]);
  const [loading, setLoading] = useState(true);

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<Record<string, string>>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const [deleting, setDeleting] = useState<ContentLogRow | null>(null);
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
    listContentLog()
      .then(setRows)
      .catch((err) => fail(apiErrorMessage(err, "Couldn't load the content log")))
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

  const openEdit = (row: ContentLogRow) => {
    setEditingId(row.id);
    setForm({
      posted_at: row.posted_at.slice(0, 10),
      platform: row.platform,
      content_type: row.content_type,
      title: row.title,
      link: row.link ?? "",
      views: row.views != null ? String(row.views) : "",
      likes: row.likes != null ? String(row.likes) : "",
      comments: row.comments != null ? String(row.comments) : "",
      shares: row.shares != null ? String(row.shares) : "",
    });
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!form.posted_at) return fail("Posted date is required");
    if (!form.title.trim()) return fail("Title is required");
    setSaving(true);
    try {
      const input: ContentLogInput = {
        posted_at: form.posted_at,
        platform: form.platform as SocialPlatform,
        content_type: form.content_type as ContentType,
        title: form.title.trim(),
        link: form.link.trim() || null,
        views: form.views.trim() ? Number(form.views) : null,
        likes: form.likes.trim() ? Number(form.likes) : null,
        comments: form.comments.trim() ? Number(form.comments) : null,
        shares: form.shares.trim() ? Number(form.shares) : null,
      };
      if (editingId) {
        await updateContentLog(editingId, input);
        succeed("Content log entry updated.");
      } else {
        await createContentLog(input);
        succeed("Content log entry added.");
      }
      setShowForm(false);
      load();
    } catch (err) {
      fail(apiErrorMessage(err, "Failed to save content log entry"));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleting) return;
    setDeleteBusy(true);
    try {
      await deleteContentLog(deleting.id);
      setRows((prev) => prev.filter((r) => r.id !== deleting.id));
      setDeleting(null);
      succeed("Content log entry deleted.");
    } catch (err) {
      fail(apiErrorMessage(err, "Failed to delete content log entry"));
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
          <p className="mb-4 font-nunito text-sm font-bold text-ink">{editingId ? "Edit" : "Add"} content log entry</p>
          <div className="flex flex-col gap-3">
            <label className="block w-full">
              <span className="mb-1.5 block font-nunito text-sm text-muted">Posted at</span>
              <input
                type="date"
                value={form.posted_at}
                onChange={(e) => setForm((f) => ({ ...f, posted_at: e.target.value }))}
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
            <label className="block w-full">
              <span className="mb-1.5 block font-nunito text-sm text-muted">Content type</span>
              <select
                value={form.content_type}
                onChange={(e) => setForm((f) => ({ ...f, content_type: e.target.value }))}
                className="w-full rounded-2xl border border-line bg-surface-2 px-4 py-3.5 font-nunito text-sm text-ink outline-none focus:border-brand"
              >
                {Object.entries(CONTENT_TYPE_LABEL).map(([k, label]) => (
                  <option key={k} value={k}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <TextInput value={form.title} onChange={(v) => setForm((f) => ({ ...f, title: v }))} placeholder="Title" maxLength={200} autoComplete="off" />
            <TextInput value={form.link} onChange={(v) => setForm((f) => ({ ...f, link: v }))} placeholder="Link (optional)" autoComplete="off" />
            <TextInput value={form.views} onChange={(v) => setForm((f) => ({ ...f, views: v }))} placeholder="Views (optional)" type="number" inputMode="numeric" autoComplete="off" />
            <TextInput value={form.likes} onChange={(v) => setForm((f) => ({ ...f, likes: v }))} placeholder="Likes (optional)" type="number" inputMode="numeric" autoComplete="off" />
            <TextInput value={form.comments} onChange={(v) => setForm((f) => ({ ...f, comments: v }))} placeholder="Comments (optional)" type="number" inputMode="numeric" autoComplete="off" />
            <TextInput value={form.shares} onChange={(v) => setForm((f) => ({ ...f, shares: v }))} placeholder="Shares (optional)" type="number" inputMode="numeric" autoComplete="off" />
          </div>
          <div className="mt-4 flex gap-2">
            <Button variant="secondary" className="flex-1" onClick={() => setShowForm(false)} disabled={saving}>
              Cancel
            </Button>
            <Button className="flex-1" loading={saving} disabled={!form.title.trim() || !form.posted_at} onClick={handleSave}>
              Save
            </Button>
          </div>
        </div>
      </Modal>

      <div className="flex items-center justify-between">
        <h2 className="font-nunito text-sm font-bold text-ink">Content log {rows.length > 0 && `(${rows.length})`}</h2>
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
        <ul className="flex flex-col gap-2">
          {rows.map((r) => (
            <li key={r.id} className="flex items-start gap-3 rounded-2xl border border-line/70 p-3.5">
              <div className="min-w-0 flex-1">
                <p className="truncate font-nunito text-sm font-semibold text-ink">{r.title}</p>
                <p className="mt-0.5 font-nunito text-[11px] text-faint">
                  {PLATFORM_LABEL[r.platform]} · {CONTENT_TYPE_LABEL[r.content_type]} · {r.posted_at.slice(0, 10)}
                  {r.views != null ? ` · ${r.views.toLocaleString()} views` : ""}
                  {r.likes != null ? ` · ${r.likes.toLocaleString()} likes` : ""}
                </p>
                {r.link && (
                  <a
                    href={r.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-1 inline-flex items-center gap-1 font-nunito text-[11px] font-semibold text-brand hover:underline"
                  >
                    <LinkIconFill className="h-3 w-3" weight="fill" />
                    View
                  </a>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-1">
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
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
