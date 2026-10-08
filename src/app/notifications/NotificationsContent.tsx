"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import {
  ArrowLeft,
  CheckCheck,
  Sparkles,
  Moon,
  MessageCircle,
  Flame,
  Heart,
  Video,
  SettingsIconFill,
  RepostIconFill,
  BroadcastsIconFill,
  AllGistsIconFill,
  TrendingIconFill,
  ChevronRight,
  X,
} from "@/components/ui/icons";
import { useNotificationStore, type Notification, type NotificationCategory, type DigestItem, type TargetType } from "@/stores/notificationStore";
import { api } from "@/lib/api";
import { Modal } from "@/components/ui/Modal";
import KappyWaving from "@/assets/illustrations/KappyWaving.webp";
import KappyAvatar from "@/assets/illustrations/kappyhead.png";

const CATEGORY_LABELS: Record<NotificationCategory, string> = {
  COMMENT: "Comments",
  REPOST: "Reposts",
  HOT_EXPIRING: "Hot posts about to disappear",
  DIGEST: "Catch Up",
  INACTIVITY_NUDGE: "\"Come back\" reminders",
  ACTIVATION_NUDGE: "\"Post something\" reminders",
};

// "Every Bubble": every notification is Kappy's own speech bubble (his
// face sits in the corner of each one, constant). What shows INSIDE is
// purely data-driven, not category-gated — whenever the backend actually
// resolved a real actor photo (actor_avitag + actor_image_url) it shows
// as a chip, whenever it resolved real content media (image_kind ===
// 'MEDIA' + image_url) it shows as a thumbnail underneath, and either,
// both or neither can be true at once (a comment shows the commenter's
// face AND the gist's own picture; your own gist hitting a milestone
// shows only its picture; a nudge shows neither). See hasActor/hasMedia
// in NotificationRow below for the actual checks.
const CATEGORY_META: Record<
  NotificationCategory,
  { label: string; labelClass: string; tintVar: string; icon: typeof MessageCircle; iconBgClass: string }
> = {
  COMMENT: { label: "Comment", labelClass: "text-brand", tintVar: "var(--color-brand)", icon: MessageCircle, iconBgClass: "bg-brand" },
  REPOST: { label: "Repost", labelClass: "text-brand-dark", tintVar: "var(--color-brand-dark)", icon: RepostIconFill, iconBgClass: "bg-brand-dark" },
  HOT_EXPIRING: { label: "Hot expiring", labelClass: "", tintVar: "var(--hot-a)", icon: Flame, iconBgClass: "" },
  DIGEST: { label: "Catch Up", labelClass: "text-brand-accent", tintVar: "var(--color-brand-accent)", icon: Sparkles, iconBgClass: "bg-brand-accent" },
  INACTIVITY_NUDGE: { label: "Nudge", labelClass: "text-faint", tintVar: "var(--color-faint)", icon: Moon, iconBgClass: "bg-faint" },
  ACTIVATION_NUDGE: { label: "Nudge", labelClass: "text-faint", tintVar: "var(--color-faint)", icon: BroadcastsIconFill, iconBgClass: "bg-faint" },
};

// HOT_EXPIRING reuses "as e dey hot"'s own flame gradient tokens (globals.css)
// rather than a flat brand color — it's the one feature on the app that
// already gets to read as "fire", and this is literally a post expiring.
const HOT_GRADIENT = { background: "linear-gradient(180deg, var(--hot-a), var(--hot-b))" };

// Same data-driven actor+media split as CATEGORY_META above, one level
// down — each bundled Catch Up item can carry both an actor chip and a
// media thumbnail too (REACTION_MILESTONE never has an actor — it's your
// own content, no second party). The icon+tint stays as the fallback
// look for whichever slot(s) the backend didn't resolve a real picture
// for (image_kind/actor_image_url came back empty).
const DIGEST_ITEM_META: Record<string, { label: (actor: string | null) => string; icon: typeof MessageCircle; solid: string; tint: string }> = {
  COURSEMATE_GIST: {
    label: (a) => (a ? `${a} posted a gist` : "A coursemate posted a gist"),
    icon: AllGistsIconFill,
    solid: "var(--color-brand)",
    tint: "color-mix(in srgb, var(--color-brand) 14%, transparent)",
  },
  REACTION_MILESTONE: {
    label: () => "Your gist hit a milestone",
    icon: Heart,
    solid: "var(--color-warning)",
    tint: "color-mix(in srgb, var(--color-warning) 18%, transparent)",
  },
  TRENDING_GIST: {
    label: (a) => (a ? `${a}'s gist is trending` : "A gist is trending"),
    icon: TrendingIconFill,
    solid: "var(--color-success)",
    tint: "color-mix(in srgb, var(--color-success) 16%, transparent)",
  },
  TRENDING_AMEBO: {
    label: (a) => (a ? `${a}'s gist is trending` : "A gist is trending"),
    icon: TrendingIconFill,
    solid: "var(--color-success)",
    tint: "color-mix(in srgb, var(--color-success) 16%, transparent)",
  },
  SPOT_LIKES: {
    label: (a) => (a ? `${a}'s Spot is blowing up` : "A Spot video is blowing up"),
    icon: Video,
    solid: "var(--color-brand-accent)",
    tint: "color-mix(in srgb, var(--color-brand-accent) 16%, transparent)",
  },
};

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

// Today / Yesterday / This week / Earlier — Signal Cards groups by
// recency instead of a flat list, so a long-unread inbox still reads as
// "this just happened" vs "catching up on older stuff". "Earlier" only
// ever spans up to ~3 weeks since cleanupOld() (backend) clears anything
// past 30 days. Notifications arrive newest-first from the store, so the
// split preserves order within each bucket.
const DAY_MS = 24 * 60 * 60 * 1000;
const GROUP_ORDER = ["Today", "Yesterday", "This week", "Earlier"] as const;

function groupByDay(notifications: Notification[]): { label: string; items: Notification[] }[] {
  const buckets: Record<(typeof GROUP_ORDER)[number], Notification[]> = {
    Today: [],
    Yesterday: [],
    "This week": [],
    Earlier: [],
  };
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  for (const n of notifications) {
    const createdMidnight = new Date(n.created_at);
    createdMidnight.setHours(0, 0, 0, 0);
    const dayDiff = Math.round((startOfToday.getTime() - createdMidnight.getTime()) / DAY_MS);

    if (dayDiff <= 0) buckets.Today.push(n);
    else if (dayDiff === 1) buckets.Yesterday.push(n);
    else if (dayDiff <= 7) buckets["This week"].push(n);
    else buckets.Earlier.push(n);
  }

  return GROUP_ORDER.filter((label) => buckets[label].length > 0).map((label) => ({ label, items: buckets[label] }));
}

function hrefForTarget(targetType: TargetType | null, targetId: string | null): string | null {
  if (!targetType || !targetId) return null;
  switch (targetType) {
    case "GIST":
      return `/gist/${targetId}`;
    case "HOT_POST":
      // There's no standalone Hot-post route — the viewer only opens from
      // the rail. Pointing at /feed is the closest honest destination
      // until that's worth a deep link of its own.
      return `/feed`;
    case "SPOT":
      return `/spot/${targetId}`;
    case "PROFILE":
      return `/${targetId}`;
    default:
      return null;
  }
}

function DigestSubitem({ item, onNavigate }: { item: DigestItem; onNavigate: (href: string) => void }) {
  // Hooks run before the meta-missing early return below, per rules of
  // hooks. Same broken-load-degrades-gracefully reasoning as
  // NotificationRow's own actorFailed/mediaFailed.
  const [actorFailed, setActorFailed] = useState(false);
  const [mediaFailed, setMediaFailed] = useState(false);
  const meta = DIGEST_ITEM_META[item.trigger_type];
  const href = hrefForTarget(item.target_type, item.target_id);
  if (!meta) return null;
  const Icon = meta.icon;
  // Purely data-driven, independent checks — only trust what the backend
  // actually resolved, never assume one implies the other. A coursemate
  // item can carry both; a milestone item (no second party) only ever
  // has hasMedia true.
  const hasActor = !!item.actor_avitag && !!item.actor_image_url && !actorFailed;
  const hasMedia = item.image_kind === "MEDIA" && !!item.image_url && !mediaFailed;

  return (
    <button
      type="button"
      disabled={!href}
      onClick={(e) => {
        e.stopPropagation();
        if (href) onNavigate(href);
      }}
      className="relative z-10 flex w-full items-center gap-2.5 rounded-xl px-1.5 py-1.5 text-left transition enabled:hover:bg-surface enabled:active:scale-[0.98] disabled:opacity-60"
    >
      {hasActor || hasMedia ? (
        <span className="relative h-8 w-8 shrink-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={(hasActor ? item.actor_image_url : item.image_url)!}
            alt=""
            onError={() => (hasActor ? setActorFailed(true) : setMediaFailed(true))}
            className={`h-8 w-8 object-cover ${hasActor ? "rounded-full" : "rounded-lg"}`}
          />
          {/* Both at once: the actor's face as the primary circle, the
              content's own media as a small corner chip overlapping it —
              same corner-badge language the top-level bubble's Hot flame
              badge already uses. */}
          {hasActor && hasMedia && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={item.image_url!}
              alt=""
              onError={() => setMediaFailed(true)}
              className="absolute -bottom-1 -right-1 h-4 w-4 rounded-[5px] border border-surface object-cover"
            />
          )}
        </span>
      ) : (
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full" style={{ background: meta.tint, color: meta.solid }}>
          <Icon className="h-3.5 w-3.5" />
        </span>
      )}
      <span className="min-w-0 flex-1 truncate font-nunito text-[12px] font-bold text-ink">{meta.label(item.actor_avitag)}</span>
      {href && <ChevronRight className="h-3.5 w-3.5 shrink-0 text-faint" />}
    </button>
  );
}

function DigestExpandPanel({ items, onNavigate }: { items: DigestItem[]; onNavigate: (href: string) => void }) {
  return (
    <div className="mt-2 flex flex-col gap-0.5 rounded-2xl bg-surface-2 p-2">
      {items.map((item, i) => (
        <DigestSubitem key={i} item={item} onNavigate={onNavigate} />
      ))}
    </div>
  );
}

// Sticker Wall: each notification is a little scrapbook sticker sitting
// on the doodle wall, slightly tilted (alternating, derived from the
// notification's own id so it stays stable across re-renders). Kappy's
// face pokes up off the top edge with a small tail pointing into the
// card — he's always the one speaking. Order: who + when (one line) →
// what he's saying → what it looked like (media, only when real — see
// hasActor/hasMedia, never a category default). Unread cards get a soft
// ring in the category's own color; read ones stay plain.
function NotificationRow({ notification }: { notification: Notification }) {
  const router = useRouter();
  const markRead = useNotificationStore((s) => s.markRead);
  const [expanded, setExpanded] = useState(false);
  // A resolved URL can still fail to actually load (a Cloudinary link
  // that 403s, a since-deleted asset) — tracked per-image so a broken
  // load degrades to "nothing shown" (same as never having resolved one)
  // instead of a visible broken-image icon on the sticker.
  const [actorFailed, setActorFailed] = useState(false);
  const [mediaFailed, setMediaFailed] = useState(false);
  const unread = !notification.read_at;
  const meta = CATEGORY_META[notification.category];
  const isDigest = notification.category === "DIGEST";
  const items = notification.payload?.items ?? [];
  const href = hrefForTarget(notification.target_type, notification.target_id);
  const isHot = notification.category === "HOT_EXPIRING";
  const hasActor = !!notification.actor_avitag && !!notification.actor_image_url && !actorFailed;
  const hasMedia = notification.image_kind === "MEDIA" && !!notification.image_url && !mediaFailed;
  // Stable per-card tilt (not random on every render) — derived from the
  // id's own last character so it never jitters on re-render or refetch.
  const tilt = notification.notification_id.charCodeAt(notification.notification_id.length - 1) % 2 === 0 ? "-1deg" : "1.1deg";
  const catColor = isHot ? "var(--hot-a)" : meta.tintVar;

  const goTo = (target: string) => {
    markRead(notification.notification_id);
    router.push(target);
  };

  const handleRowClick = () => {
    markRead(notification.notification_id);
    if (isDigest) {
      setExpanded((v) => !v);
    } else if (href) {
      router.push(href);
    }
  };

  return (
    <div className="flex items-start gap-2">
      {/* Kappy's own constant face — sits OUTSIDE the card now, beside it
          at the top, upright (never tilted with the card). The classic
          chat-bubble "sender avatar beside the message" pattern, paired
          with the card's own tail pointing back at him below. */}
      <span className="relative z-10 mt-1 h-9 w-9 shrink-0 overflow-hidden rounded-full border-[3px] bg-white shadow-md" style={{ borderColor: catColor }}>
        <Image src={KappyAvatar} alt="" width={36} height={36} className="h-full w-full object-cover" />
      </span>

      <div className="relative min-w-0 flex-1" style={{ transform: `rotate(${tilt})` }}>
        {/* Tail pointing left, back at Kappy — the card is clearly his,
            without needing to sit on top of or beside his own circle. */}
        <span
          className="absolute -left-[7px] top-4 z-10 h-0 w-0 border-y-[6px] border-r-[8px] border-y-transparent"
          style={{ borderRightColor: catColor }}
          aria-hidden
        />
        <div
          className="rounded-[20px] bg-surface-2 p-2.5 shadow-[0_6px_16px_-6px_rgba(23,26,31,0.18)]"
          style={unread ? { boxShadow: `0 6px 16px -6px rgba(23,26,31,0.18), 0 0 0 2px color-mix(in srgb, ${catColor} 45%, transparent)` } : undefined}
        >
        <button type="button" onClick={handleRowClick} className="w-full text-left">
          {/* Who + when together — the two pieces of metadata about the
              event belong on one line, same as any social app's
              "name · time" convention. Category pill stays pinned right. */}
          <div className="mb-1.5 flex items-center gap-1.5">
            {hasActor && (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={notification.actor_image_url!}
                  alt=""
                  onError={() => setActorFailed(true)}
                  className="h-7 w-7 shrink-0 rounded-full border-2 object-cover"
                  style={{ borderColor: catColor }}
                />
                <span className="font-nunito text-[11.5px] font-extrabold text-ink">{notification.actor_avitag}</span>
                <span className="h-[2.5px] w-[2.5px] shrink-0 rounded-full bg-faint" aria-hidden />
              </>
            )}
            <span className="shrink-0 font-nunito text-[10px] font-semibold text-faint">{timeAgo(notification.created_at)}</span>
            <span
              className="ml-auto shrink-0 rounded-full px-2 py-0.5 font-nunito text-[9px] font-extrabold uppercase tracking-wide text-white"
              style={isHot ? HOT_GRADIENT : { background: catColor }}
            >
              {meta.label}
            </span>
          </div>

          {/* What Kappy's saying — reads before the media now, since text
              gives context instantly (and renders before any image has
              even loaded) while a bare photo first doesn't say why it's
              there. Unread is already carried by the card's own colored
              ring, so there's no separate dot duplicating that signal. */}
          <div className="mb-1.5 flex items-start justify-between gap-2">
            <p className={`flex-1 font-nunito text-[13px] font-bold leading-snug ${unread ? "text-ink" : "text-muted"}`}>{notification.kappy_line}</p>
            <div className="mt-0.5 flex shrink-0 items-center gap-1.5">
              {isDigest && items.length > 0 && (
                <ChevronRight className={`h-3.5 w-3.5 shrink-0 text-faint transition-transform ${expanded ? "rotate-90" : ""}`} />
              )}
            </div>
          </div>

          {/* What it looked like — media, only when real. No frame — just
              the picture itself, rounded, so it doesn't eat height. */}
          {hasMedia && (
            <div className="relative h-16 w-28 shrink-0 overflow-hidden rounded-lg shadow-sm">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={notification.image_url!}
                alt=""
                onError={() => setMediaFailed(true)}
                className="h-full w-full object-cover"
              />
              {isHot && (
                <span
                  className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full border-2 border-surface"
                  style={HOT_GRADIENT}
                  aria-hidden
                >
                  <Flame className="h-2.5 w-2.5 text-white" />
                </span>
              )}
            </div>
          )}
        </button>

        {isDigest && expanded && items.length > 0 && <DigestExpandPanel items={items} onNavigate={goTo} />}
        </div>
      </div>
    </div>
  );
}

// One short line per category so each switch reads as a decision, not
// just a label — shown directly under the row's name in the modal.
const CATEGORY_DESCRIPTIONS: Record<NotificationCategory, string> = {
  COMMENT: "When someone comments on your gist or amebo",
  REPOST: "When someone reposts something of yours",
  HOT_EXPIRING: "When a hot post you're in is about to disappear",
  DIGEST: "A roundup of what you missed, every so often",
  INACTIVITY_NUDGE: "A nudge if you've been away for a while",
  ACTIVATION_NUDGE: "A nudge to post if your feed's gone quiet",
};

/** Same switch look as SoundToggle, local to this panel so each row can
 * carry its own per-category saving state. */
function PreferenceSwitch({
  on,
  disabled,
  label,
  onToggle,
}: {
  on: boolean;
  disabled: boolean;
  label: string;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={`${on ? "Turn off" : "Turn on"} ${label}`}
      disabled={disabled}
      onClick={onToggle}
      className={`relative h-7 w-12 shrink-0 rounded-full transition-colors disabled:opacity-50 ${
        on ? "bg-brand" : "bg-line dark:bg-white/15"
      }`}
    >
      <span
        className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-[left] duration-200 ease-out ${
          on ? "left-[22px]" : "left-0.5"
        }`}
      />
    </button>
  );
}

function PreferenceRow({
  cat,
  enabled,
  saving,
  onToggle,
}: {
  cat: NotificationCategory;
  enabled: boolean;
  saving: boolean;
  onToggle: () => void;
}) {
  const meta = CATEGORY_META[cat];
  const Icon = meta.icon;
  const isHot = cat === "HOT_EXPIRING";
  return (
    <div className="flex items-center gap-3 py-3.5">
      <span
        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-white ${meta.iconBgClass}`}
        style={isHot ? HOT_GRADIENT : undefined}
      >
        <Icon className="h-4 w-4 text-white" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-nunito text-[13px] font-bold text-ink">{CATEGORY_LABELS[cat]}</p>
        <p className="mt-0.5 font-nunito text-[11.5px] leading-snug text-muted">{CATEGORY_DESCRIPTIONS[cat]}</p>
      </div>
      <PreferenceSwitch on={enabled} disabled={saving} label={CATEGORY_LABELS[cat]} onToggle={onToggle} />
    </div>
  );
}

function PreferencesPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [muted, setMuted] = useState<string[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [savingCat, setSavingCat] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    void (async () => {
      try {
        const res = await api.get<{ data: { muted_categories: string[] } }>("/notifications/preferences");
        setMuted(res.data.data.muted_categories);
      } catch {
        /* defaults to nothing muted */
      } finally {
        setLoaded(true);
      }
    })();
  }, [open]);

  const toggle = async (category: string) => {
    const next = muted.includes(category) ? muted.filter((c) => c !== category) : [...muted, category];
    setMuted(next);
    setSavingCat(category);
    try {
      await api.put("/notifications/preferences", { muted_categories: next });
    } finally {
      setSavingCat(null);
    }
  };

  return (
    <Modal open={open} onClose={onClose} variant="sheet" desktopCenter>
      <div className="max-h-[85vh] overflow-y-auto rounded-t-3xl bg-surface p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom,0px))] md:rounded-3xl">
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-line md:hidden" aria-hidden />
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="font-nunito text-lg font-extrabold text-ink">Notification settings</h2>
            <p className="mt-0.5 font-nunito text-[12.5px] text-muted">Choose what Kappy should let you know about.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted transition hover:bg-line/60 active:scale-95"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {!loaded ? (
          <div className="mt-4 flex flex-col gap-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-10 animate-pulse rounded-2xl bg-line/40" />
            ))}
          </div>
        ) : (
          <div className="mt-2 flex flex-col divide-y divide-line">
            {(Object.keys(CATEGORY_LABELS) as NotificationCategory[]).map((cat) => (
              <PreferenceRow
                key={cat}
                cat={cat}
                enabled={!muted.includes(cat)}
                saving={savingCat === cat}
                onToggle={() => void toggle(cat)}
              />
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
}

export function NotificationsContent() {
  const router = useRouter();
  const { notifications, loaded, fetchAll, markAllRead } = useNotificationStore();
  const [showPrefs, setShowPrefs] = useState(false);

  useEffect(() => {
    void fetchAll();
  }, [fetchAll]);

  const hasUnread = notifications.some((n) => !n.read_at);

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      {/* Same faint tiled doodle AppShell's own "panel" variant already
          paints behind this page — that copy is desktop-only (md:block),
          so on mobile this screen was missing it entirely. Painted here
          directly instead so it shows regardless of viewport. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-0 opacity-50 dark:opacity-50 dark:invert"
        style={{
          backgroundImage: "url('/brand/doodles.svg')",
          backgroundRepeat: "repeat",
          backgroundSize: "220px auto",
        }}
      />

      <div className="relative z-10 flex items-center justify-between border-b border-line px-4 py-3 pt-[calc(0.75rem+env(safe-area-inset-top,0px))]">
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => router.back()} aria-label="Back" className="flex h-8 w-8 items-center justify-center rounded-full text-ink">
            <ArrowLeft className="h-5 w-5" />
          </button>
          <h1 className="font-nunito text-base font-extrabold text-ink">Notifications</h1>
        </div>
        <div className="flex items-center gap-1">
          {hasUnread && (
            <button
              type="button"
              onClick={markAllRead}
              aria-label="Mark all read"
              title="Mark all read"
              className="flex h-9 w-9 items-center justify-center rounded-full text-muted transition hover:bg-brand-tint hover:text-brand active:scale-95"
            >
              <CheckCheck className="h-[18px] w-[18px]" />
            </button>
          )}
          <button
            type="button"
            onClick={() => setShowPrefs(true)}
            aria-label="Notification settings"
            title="Settings"
            className="flex h-9 w-9 items-center justify-center rounded-full text-muted transition hover:bg-brand-tint hover:text-brand active:scale-95"
          >
            <SettingsIconFill className="h-[18px] w-[18px]" />
          </button>
        </div>
      </div>

      <PreferencesPanel open={showPrefs} onClose={() => setShowPrefs(false)} />

      <div className="relative z-10 border-b border-line px-4 py-2.5">
        <p className="font-nunito text-[11px] leading-snug text-faint">
          This na Kappy keeping you posted on updates, wetin you no suppose miss, and small reminders. After 30 days we
          clear old notifications so we go get more space for new ones.
        </p>
      </div>

      <div className="relative z-10 min-h-0 flex-1 overflow-y-auto px-2 pb-8 pt-3">
        {!loaded ? (
          <div className="flex flex-col gap-2.5 px-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-14 animate-pulse rounded-xl bg-line/40" />
            ))}
          </div>
        ) : notifications.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-16 text-center">
            <Image src={KappyWaving} alt="" className="h-24 w-auto" />
            <p className="font-nunito text-sm font-semibold text-muted">Nothing here yet — Kappy go holler you when something happens</p>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {groupByDay(notifications).map((group) => (
              <div key={group.label} className="flex flex-col gap-2">
                <p className="px-1 font-nunito text-[11px] font-extrabold uppercase tracking-wide text-faint">{group.label}</p>
                <div className="flex flex-col gap-3">
                  {group.items.map((n) => (
                    <NotificationRow key={n.notification_id} notification={n} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
