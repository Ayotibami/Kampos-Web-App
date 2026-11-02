import { create } from "zustand";
import { api, apiErrorMessage, type ApiEnvelope } from "@/lib/api";
import type { BroadcastSummary } from "@/lib/serverBroadcasts";

export type { BroadcastSummary };

/** Which profile type(s) a broadcast targets — all five are fully wired
 * end to end now, backend included: the audience query reaches every
 * active profile across whichever of the five the king picks, not just
 * students. */
export type BroadcastAudience = "STUDENT" | "KREATOR" | "KOMPANY" | "SCHOOL" | "IDIOT";

/** A broadcast can go out by either channel independently, or both at
 * once — "email" is the original mass-email path; "notification" means
 * BOTH a row on every recipient's notification screen AND a real push to
 * their device (one choice covers both, never split further — see the
 * king's own "if i want to choose notifications i choose notifications"
 * framing). At least one must be set. */
export interface CreateBroadcastParams {
  subject: string;
  message: string;
  /** Multi-select, not one-of — a single broadcast can target several
   * profile types at once (e.g. Students AND Kreators in the same send).
   * At least one must be picked. */
  audiences: BroadcastAudience[];
  viaEmail: boolean;
  viaNotification: boolean;
}

/** Real counts from the backend, split by channel — email dedupes to one
 * per ACCOUNT (an account running two profiles in the picked audiences
 * only gets emailed once); notification/push stays one per PROFILE, since
 * that's a genuinely separate screen each profile has its own. */
export interface RecipientCount {
  emailCount: number;
  notificationCount: number;
}

interface BroadcastState {
  loading: boolean;
  error: string | null;
  /** Lets the compose screen show real numbers before the king commits to
   * anything irreversible. */
  fetchRecipientCount: (audiences: BroadcastAudience[]) => Promise<RecipientCount>;
  createBroadcast: (params: CreateBroadcastParams) => Promise<{ broadcast_id: string; total_recipients: number }>;
  /** Client-side re-fetch of the same list serverBroadcasts.ts's
   * listBroadcasts() loads for the page's first render — used after
   * sending a new one, and safe to call again later to watch a large
   * broadcast's pending_count drain over time. */
  refreshBroadcasts: () => Promise<BroadcastSummary[]>;
}

/**
 * Client-side counterpart to lib/serverBroadcasts.ts — /idiot/broadcasts is
 * king-only end-to-end (the backend itself 403s a plain idiot admin, not
 * just a hidden nav link), same trust model as adminStore.ts's grant/
 * revoke. Kept as its own store rather than folded into moderationStore —
 * "reach every account" is its own concern, not a moderation action.
 */
export const useBroadcastStore = create<BroadcastState>((set) => ({
  loading: false,
  error: null,

  fetchRecipientCount: async (audiences) => {
    try {
      const res = await api.get<ApiEnvelope<{ email_count: number; notification_count: number }>>(
        "/idiot/broadcasts/recipient-count",
        { params: { audiences: audiences.join(",") } },
      );
      return {
        emailCount: res.data?.data?.email_count ?? 0,
        notificationCount: res.data?.data?.notification_count ?? 0,
      };
    } catch (err) {
      throw new Error(apiErrorMessage(err, "Failed to load recipient count"));
    }
  },

  createBroadcast: async ({ subject, message, audiences, viaEmail, viaNotification }) => {
    set({ loading: true, error: null });
    try {
      const res = await api.post<ApiEnvelope<{ broadcast_id: string; total_recipients: number }>>(
        "/idiot/broadcasts",
        { subject, message, audiences, via_email: viaEmail, via_notification: viaNotification },
      );
      set({ loading: false });
      return res.data?.data ?? { broadcast_id: "", total_recipients: 0 };
    } catch (err) {
      set({ error: apiErrorMessage(err, "Failed to send broadcast"), loading: false });
      throw err;
    }
  },

  refreshBroadcasts: async () => {
    try {
      const res = await api.get<ApiEnvelope<BroadcastSummary[]>>("/idiot/broadcasts");
      return res.data?.data ?? [];
    } catch (err) {
      throw new Error(apiErrorMessage(err, "Failed to load broadcasts"));
    }
  },
}));
