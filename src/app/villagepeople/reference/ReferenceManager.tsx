"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { TextInput } from "@/components/ui/TextInput";
import { Modal } from "@/components/ui/Modal";
import { ConfirmModal, ErrorModal, SuccessModal } from "@/components/ui/FeedbackModal";
import { Plus, EditIconFill, DeleteIconFill } from "@/components/ui/icons";
import { apiErrorMessage } from "@/lib/api";
import type { CampusRow, MajorRow } from "@/lib/serverReference";
import { useReferenceAdminStore } from "@/stores/referenceAdminStore";

/** Common shape both CampusRow and MajorRow normalize to for the shared
 * column component below — campus_tag/campus_name vs major_tag/major_name
 * are different field names on the wire, but the same {tag, name} shape
 * once here. */
interface Item {
  tag: string;
  name: string;
}

/**
 * One column — Campuses or Majors, structurally identical, just pointed at
 * different store actions and copy. Kept as one shared component (not two
 * near-duplicate files) since every behavior (add/edit-name/delete-with-
 * usage-check) is genuinely identical between the two; only the label
 * strings and which store action fires differ.
 */
function EntityColumn({
  title,
  singular,
  tagFieldLabel,
  items,
  onCreate,
  onUpdate,
  onDelete,
}: {
  title: string;
  /** "Campus"/"Major" — an explicit singular label, NOT derived from
   * `title` by string-slicing. `title.slice(0, -1)` on "Campuses" gives
   * "Campuse", not "Campus" — confirmed live (an early version of this
   * screen actually said "Campuse added." in its own success toast). */
  singular: string;
  tagFieldLabel: string;
  items: Item[];
  onCreate: (tag: string, name: string) => Promise<Item>;
  onUpdate: (tag: string, name: string) => Promise<Item>;
  onDelete: (tag: string) => Promise<void>;
}) {
  const [rows, setRows] = useState<Item[]>(items);
  const [showAdd, setShowAdd] = useState(false);
  const [newTag, setNewTag] = useState("");
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);

  const [editing, setEditing] = useState<Item | null>(null);
  const [editName, setEditName] = useState("");
  const [saving, setSaving] = useState(false);

  const [deleting, setDeleting] = useState<Item | null>(null);
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

  const resetAddForm = () => {
    setShowAdd(false);
    setNewTag("");
    setNewName("");
  };

  const handleCreate = async () => {
    setCreating(true);
    try {
      const created = await onCreate(newTag.trim().toLowerCase(), newName.trim());
      setRows((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)));
      resetAddForm();
      succeed(`${singular} added.`);
    } catch (err) {
      fail(apiErrorMessage(err, `Failed to add ${singular.toLowerCase()}`));
    } finally {
      setCreating(false);
    }
  };

  const openEdit = (item: Item) => {
    setEditing(item);
    setEditName(item.name);
  };

  const handleSaveEdit = async () => {
    if (!editing) return;
    setSaving(true);
    try {
      const updated = await onUpdate(editing.tag, editName.trim());
      setRows((prev) => prev.map((r) => (r.tag === updated.tag ? updated : r)).sort((a, b) => a.name.localeCompare(b.name)));
      setEditing(null);
      succeed(`${singular} updated.`);
    } catch (err) {
      fail(apiErrorMessage(err, `Failed to update ${singular.toLowerCase()}`));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleting) return;
    setDeleteBusy(true);
    try {
      await onDelete(deleting.tag);
      setRows((prev) => prev.filter((r) => r.tag !== deleting.tag));
      setDeleting(null);
      succeed(`${singular} deleted.`);
    } catch (err) {
      // A 409 "still in use" comes back with the real breakdown already
      // written into the message server-side (see reference.controller.ts's
      // deleteCampus/deleteMajor) — surfaced verbatim, not replaced with a
      // generic fallback, since that breakdown is the whole point.
      fail(apiErrorMessage(err, `Failed to delete ${singular.toLowerCase()}`));
      setDeleting(null);
    } finally {
      setDeleteBusy(false);
    }
  };

  return (
    <section className="flex min-w-0 flex-1 flex-col gap-3 rounded-2xl border border-line/70 p-4">
      <ErrorModal open={showError} onClose={() => setShowError(false)} message={errorMessage} />
      <SuccessModal open={showSuccess} onClose={() => setShowSuccess(false)} message={successMessage} />

      <Modal open={showAdd} onClose={() => (creating ? undefined : resetAddForm())}>
        <div className="rounded-3xl bg-surface p-5 shadow-2xl">
          <p className="mb-4 font-nunito text-sm font-bold text-ink">Add {singular.toLowerCase()}</p>
          <div className="flex flex-col gap-3">
            <div>
              <TextInput
                value={newTag}
                onChange={(v) => setNewTag(v.toLowerCase())}
                placeholder={tagFieldLabel}
                maxLength={24}
                autoComplete="off"
                autoCapitalize="none"
              />
              <p className="mt-1 font-nunito text-xs text-faint">
                Lowercase, letters/digits/underscore only — can&apos;t be changed once created.
              </p>
            </div>
            <TextInput value={newName} onChange={setNewName} placeholder="Full name" maxLength={120} autoComplete="off" />
          </div>
          <div className="mt-4 flex gap-2">
            <Button variant="secondary" className="flex-1" onClick={resetAddForm} disabled={creating}>
              Cancel
            </Button>
            <Button className="flex-1" loading={creating} disabled={!newTag.trim() || !newName.trim()} onClick={handleCreate}>
              Add
            </Button>
          </div>
        </div>
      </Modal>

      <Modal open={!!editing} onClose={() => (saving ? undefined : setEditing(null))}>
        <div className="rounded-3xl bg-surface p-5 shadow-2xl">
          <p className="mb-1 font-nunito text-sm font-bold text-ink">Edit name</p>
          <p className="mb-4 font-nunito text-xs text-faint">
            Tag <span className="font-semibold text-ink">{editing?.tag}</span> stays fixed — only the full name can
            change.
          </p>
          <TextInput value={editName} onChange={setEditName} placeholder="Full name" maxLength={120} autoComplete="off" />
          <div className="mt-4 flex gap-2">
            <Button variant="secondary" className="flex-1" onClick={() => setEditing(null)} disabled={saving}>
              Cancel
            </Button>
            <Button className="flex-1" loading={saving} disabled={!editName.trim()} onClick={handleSaveEdit}>
              Save
            </Button>
          </div>
        </div>
      </Modal>

      <ConfirmModal
        open={!!deleting}
        onClose={() => (deleteBusy ? undefined : setDeleting(null))}
        onConfirm={handleDelete}
        title={`Delete ${deleting?.name}?`}
        message="This can't be undone. If it's still in use anywhere, this will tell you what's using it instead of deleting."
        confirmLabel="Delete"
        loading={deleteBusy}
        icon={<DeleteIconFill size={24} weight="fill" />}
      />

      <div className="flex items-center justify-between gap-3">
        <h2 className="font-nunito text-sm font-bold text-ink">
          {title} {rows.length > 0 && `(${rows.length})`}
        </h2>
        <Button variant="secondary" fullWidth={false} className="!px-3.5 !py-1.5 text-xs" onClick={() => setShowAdd(true)}>
          <Plus className="h-3.5 w-3.5" />
          Add
        </Button>
      </div>

      {rows.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-line/70 p-6 text-center font-nunito text-sm text-muted">
          None yet.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {rows.map((item) => (
            <li
              key={item.tag}
              className="flex items-center justify-between gap-3 rounded-2xl border border-line/70 p-3.5"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate font-nunito text-sm font-semibold text-ink">{item.name}</p>
                <span className="mt-0.5 inline-block rounded-full bg-brand/10 px-2 py-0.5 font-nunito text-[11px] font-bold uppercase tracking-wide text-brand">
                  {item.tag}
                </span>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <button
                  type="button"
                  onClick={() => openEdit(item)}
                  aria-label={`Edit ${item.name}`}
                  className="flex h-8 w-8 items-center justify-center rounded-full text-muted transition hover:bg-brand/10 hover:text-brand"
                >
                  <EditIconFill className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setDeleting(item)}
                  aria-label={`Delete ${item.name}`}
                  className="flex h-8 w-8 items-center justify-center rounded-full text-danger transition hover:bg-danger/10"
                >
                  <DeleteIconFill className="h-4 w-4" weight="fill" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function ReferenceManager({
  initialCampuses,
  initialMajors,
}: {
  initialCampuses: CampusRow[];
  initialMajors: MajorRow[];
}) {
  const createCampus = useReferenceAdminStore((s) => s.createCampus);
  const updateCampus = useReferenceAdminStore((s) => s.updateCampus);
  const deleteCampus = useReferenceAdminStore((s) => s.deleteCampus);
  const createMajor = useReferenceAdminStore((s) => s.createMajor);
  const updateMajor = useReferenceAdminStore((s) => s.updateMajor);
  const deleteMajor = useReferenceAdminStore((s) => s.deleteMajor);

  const campusItems: Item[] = initialCampuses.map((c) => ({ tag: c.campus_tag, name: c.campus_name }));
  const majorItems: Item[] = initialMajors.map((m) => ({ tag: m.major_tag, name: m.major_name }));

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-6 py-10 md:px-10">
      <div>
        <h1 className="font-nunito text-2xl font-extrabold text-ink">Campuses &amp; Majors</h1>
        <p className="mt-1 font-nunito text-sm text-muted">
          What every setup wizard and filter picker in the app draws from. A tag is permanent once created — only
          the full name can change afterward.
        </p>
      </div>

      <div className="flex flex-col gap-6 md:flex-row">
        <EntityColumn
          title="Campuses"
          singular="Campus"
          tagFieldLabel="Tag (e.g. unilag)"
          items={campusItems}
          onCreate={async (tag, name) => {
            const c = await createCampus(tag, name);
            return { tag: c.campus_tag, name: c.campus_name };
          }}
          onUpdate={async (tag, name) => {
            const c = await updateCampus(tag, name);
            return { tag: c.campus_tag, name: c.campus_name };
          }}
          onDelete={deleteCampus}
        />
        <EntityColumn
          title="Majors"
          singular="Major"
          tagFieldLabel="Tag (e.g. cs)"
          items={majorItems}
          onCreate={async (tag, name) => {
            const m = await createMajor(tag, name);
            return { tag: m.major_tag, name: m.major_name };
          }}
          onUpdate={async (tag, name) => {
            const m = await updateMajor(tag, name);
            return { tag: m.major_tag, name: m.major_name };
          }}
          onDelete={deleteMajor}
        />
      </div>
    </div>
  );
}
