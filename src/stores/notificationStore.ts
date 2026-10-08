import { create } from "zustand";
import { api, apiGet, apiErrorMessage } from "@/lib/api";
import { wsClient } from "@/lib/ws";

export type NotificationCategory = "COMMENT" | "REPOST" | "HOT_EXPIRING" | "DIGEST" | "INACTIVITY_NUDGE" | "ACTIVATION_NUDGE";
export type ImageKind = "KAPPY" | "PROFILE_PICTURE" | "MEDIA";
export type TargetType = "GIST" | "SPOT" | "HOT_POST" | "PROFILE";

export interface DigestItem {
  trigger_type: string;
  target_type: TargetType;
  target_id: string;
  // Who, when there's a real person behind it — null when anonymous or
  // there's no single actor (e.g. your own gist hitting a milestone).
  actor_avitag: string | null;
  // That person's own photo — kept separate from image_kind/image_url
  // (always the CONTENT's own media here) so both can show at once.
  actor_image_url: string | null;
  image_kind: ImageKind;
  image_url: string | null;
}

export interface Notification {
  notification_id: string;
  recipient_avitag: string;
  category: NotificationCategory;
  kappy_line: string;
  // The content's own media (a gist/Spot/Hot post's picture or video) —
  // 'MEDIA' + a real url when one was found, 'KAPPY' + null otherwise.
  image_kind: ImageKind;
  image_url: string | null;
  // Who triggered this, when a single real person is the point
  // (COMMENT, REPOST, HOT_EXPIRING) — null otherwise.
  actor_avitag: string | null;
  // That person's own photo, independent of image_kind/image_url above —
  // see NotificationsContent.tsx's own NotificationRow for how a bubble
  // shows the actor chip and the media thumbnail together when both are
  // real, just one of them when only one is, or neither.
  actor_image_url: string | null;
  target_type: TargetType | null;
  target_id: string | null;
  payload: { items?: DigestItem[] } | null;
  read_at: string | null;
  created_at: string;
}

interface NotificationState {
  notifications: Notification[];
  unreadCount: number;
  loaded: boolean;
  loading: boolean;
  error: string | null;

  fetchAll: () => Promise<void>;
  fetchUnreadCount: () => Promise<void>;
  markRead: (notificationId: string) => void;
  markAllRead: () => void;
}

export const useNotificationStore = create<NotificationState>((set, get) => ({
  notifications: [],
  unreadCount: 0,
  loaded: false,
  loading: false,
  error: null,

  fetchAll: async () => {
    set({ loading: true, error: null });
    try {
      const data = await apiGet<Notification[]>("/notifications");
      set({ notifications: data ?? [], loaded: true, loading: false });
    } catch (err) {
      set({ loading: false, loaded: true, error: apiErrorMessage(err, "Couldn't load notifications") });
    }
  },

  fetchUnreadCount: async () => {
    try {
      const data = await apiGet<{ count: number }>("/notifications/unread-count");
      set({ unreadCount: data?.count ?? 0 });
    } catch {
      // Best-effort — a badge that fails to update just shows the last
      // known count until the next successful poll, never worth a toast.
    }
  },

  // Optimistic, same pattern hotStore.ts's own markSeen uses — updates
  // local state immediately, fire-and-forget on the network call.
  markRead: (notificationId) => {
    const n = get().notifications.find((x) => x.notification_id === notificationId);
    if (!n || n.read_at) return;
    set((s) => ({
      notifications: s.notifications.map((x) => (x.notification_id === notificationId ? { ...x, read_at: new Date().toISOString() } : x)),
      unreadCount: Math.max(0, s.unreadCount - 1),
    }));
    void api.post(`/notifications/${notificationId}/read`).catch(() => {});
  },

  markAllRead: () => {
    set((s) => ({
      notifications: s.notifications.map((x) => (x.read_at ? x : { ...x, read_at: new Date().toISOString() })),
      unreadCount: 0,
    }));
    void api.post(`/notifications/read-all`).catch(() => {});
  },
}));

// HMR-safe module-level WS wiring — same pattern hotStore.ts's own
// hot_post:created subscription uses. A live notification pushes straight
// into state instead of waiting for the next poll/fetch.
const wsHandles = globalThis as unknown as { __kamposNotificationUnsub?: () => void };
wsHandles.__kamposNotificationUnsub?.();

if (typeof window !== "undefined") {
  wsHandles.__kamposNotificationUnsub = wsClient.subscribe("notification:new", (payload) => {
    const p = payload as { notification?: Notification } | undefined;
    if (!p?.notification) return;
    useNotificationStore.setState((s) => ({
      notifications: [p.notification!, ...s.notifications],
      unreadCount: s.unreadCount + 1,
    }));
  });
}
