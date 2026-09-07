"use client";

import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { EditIconFill, DeleteIconFill } from "@/components/ui/icons";
import { statusColor, type DisplayField } from "./shared";

/**
 * One row shell shared by all 5 Profiles tabs — avatar (in the sized ring
 * div this app always wraps `Avatar` in, per its own established
 * convention — see AccountDetailManager.tsx/ProfileVerificationsTab.tsx for
 * the same pattern; `Avatar` is never handed a size className directly),
 * name/avitag, a verified badge, a non-active status badge, the
 * type-specific "at a glance" field grid (built per-type by each tab via
 * shared.tsx's buildFields), and the View/Edit/Verify.Unverify/Delete row
 * actions.
 *
 * Clicking the avatar/name area itself opens the full profile-view page
 * (/villagepeople/profiles/[type]/[avitag] — full info + this profile's
 * own gists, for moderation) — the pencil icon is a shortcut straight to
 * editing (.../edit) for admins who already know they just want to fix a
 * field, without an extra hop through the view page first.
 *
 * The Verify button is a toggle — it always renders, reading "Verify" when
 * the profile isn't verified yet and "Unverify" when it already is, so a
 * mistaken verification can be undone. Each tab's own onVerify handler
 * decides which of verifyProfile/unverifyProfile to call based on the
 * row's current `is_verified`.
 *
 * Ban is a second toggle, same idea — "Ban" when active, "Unban" when
 * already banned — admin-controlled, mechanically identical to a
 * self-deactivate but reversible only by an admin (see the profile-status
 * design doc trail). Hidden once the profile is DELETED, since that's
 * terminal and there's nothing left to ban.
 */
export function ProfileRowCard({
  avatarSrc,
  displayName,
  avitag,
  verified,
  status,
  fields,
  busy,
  onView,
  onEdit,
  onVerify,
  onBan,
  onDelete,
}: {
  avatarSrc?: string | null;
  displayName?: string | null;
  avitag: string;
  verified?: boolean;
  status?: string;
  fields: DisplayField[];
  /** "verify" | "ban" | "delete" while that specific action is in flight
   * for this row, or null when idle — disables every action button on the
   * row (not just the one clicked) so a second click can't race the
   * first. */
  busy: "verify" | "ban" | "delete" | null;
  onView: () => void;
  onEdit: () => void;
  onVerify: () => void;
  onBan: () => void;
  onDelete: () => void;
}) {
  const banned = status === "BANNED";
  const deleted = status === "DELETED";
  const disabled = busy !== null;
  return (
    <li className="flex flex-col gap-3 rounded-2xl border border-line/70 p-4">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onView}
          disabled={disabled}
          className="flex min-w-0 flex-1 items-center gap-3 rounded-xl text-left transition hover:bg-brand/5 disabled:opacity-50"
        >
          <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full bg-brand/10 ring-1 ring-line">
            <Avatar src={avatarSrc} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate font-nunito text-sm font-semibold text-ink">
              {displayName || `@${avitag}`}
            </p>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <span className="font-nunito text-[11px] text-muted">@{avitag}</span>
              {verified && (
                <span className="font-nunito text-[11px] font-medium text-success">Verified</span>
              )}
              {status && status !== "ACTIVE" && (
                <span className={`font-nunito text-[11px] font-medium ${statusColor(status)}`}>{status}</span>
              )}
            </div>
          </div>
        </button>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={onEdit}
            disabled={disabled}
            aria-label="Edit profile"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted transition hover:bg-brand/10 hover:text-brand disabled:opacity-50"
          >
            <EditIconFill className="h-3.5 w-3.5" />
          </button>
          <Button
            variant={verified ? "secondary" : "primary"}
            fullWidth={false}
            className="!px-4 !py-2 text-sm"
            loading={busy === "verify"}
            disabled={disabled}
            onClick={onVerify}
          >
            {verified ? "Unverify" : "Verify"}
          </Button>
          {!deleted && (
            <Button
              variant="secondary"
              fullWidth={false}
              className={
                banned
                  ? "!px-4 !py-2 text-sm"
                  : "!border-warning !px-4 !py-2 text-sm !text-warning hover:!bg-warning/10"
              }
              loading={busy === "ban"}
              disabled={disabled}
              onClick={onBan}
            >
              {banned ? "Unban" : "Ban"}
            </Button>
          )}
          <button
            type="button"
            onClick={onDelete}
            disabled={disabled}
            aria-label="Delete profile"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-danger transition hover:bg-danger/10 disabled:opacity-50"
          >
            <DeleteIconFill className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {fields.length > 0 && (
        <div className="grid grid-cols-2 gap-x-4 gap-y-3 rounded-xl bg-surface-2 p-3 sm:grid-cols-3">
          {fields.map((f) => (
            <div key={f.label} className="min-w-0">
              <p className="font-nunito text-[11px] text-muted">{f.label}</p>
              <p className="mt-0.5 break-words font-nunito text-xs font-semibold text-ink">{f.value}</p>
            </div>
          ))}
        </div>
      )}
    </li>
  );
}
