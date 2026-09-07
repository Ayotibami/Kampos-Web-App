import { create } from "zustand";
import { api, apiErrorMessage, type ApiEnvelope } from "@/lib/api";
import { buildUserSearchQuery } from "@/lib/userSearchQuery";
import type { AccountDetail, UserSearchFilters, AccountSearchRow } from "@/lib/serverUsers";
import { PROFILE_TYPE_PATH } from "@/lib/profileEditFields";
import type { ProfileType } from "@/types";

export type { AccountSearchRow, UserSearchFilters, AccountDetail };

/** Whatever POST /idiot/users hands back for the newly-created account —
 * typed loosely (rather than reusing AccountDetailRow) since the written
 * contract only promises "creates an account", not an exact response
 * shape; `account_id` is read defensively wherever this is consumed. */
export interface CreatedAccount {
  account_id?: string;
  email?: string;
  [key: string]: unknown;
}

interface UserManagementState {
  loading: boolean;
  error: string | null;
  /** Client-side re-search — used by the Users page for every filter
   * change/page turn after the server page's own initial unfiltered load,
   * same "re-fetch through the shared api client" split as
   * adminStore.refreshAdmins vs serverAdmins.listAdmins. */
  searchUsers: (filters: UserSearchFilters) => Promise<AccountSearchRow[]>;
  /** Client-side re-fetch of one account's detail — used after an edit
   * (profile save, email change) so the detail page reflects the backend's
   * own resulting state rather than a locally guessed merge. */
  getAccount: (accountId: string) => Promise<AccountDetail | undefined>;
  createAccount: (email: string, password: string) => Promise<CreatedAccount | undefined>;
  /** King-only end-to-end (backend 403s a non-king caller itself, per the
   * same pattern adminStore's grant/revoke already documents) — every
   * caller into this is already behind this app's own king-only UI gate on
   * the email-edit control. */
  updateEmail: (accountId: string, email: string) => Promise<void>;
  /**
   * Reuses the SAME per-type profile endpoints the consumer app's own
   * self-service profile editing already calls (PUT /profiles/<type>/:avitag
   * — see profileStore.ts's updateStudentProfile, which hits the identical
   * route for the signed-in user's own profile). Those routes already
   * accept an admin editing someone else's profile (each controller's own
   * `isAdminRole(req.user.role)` bypass of the ownership check — see e.g.
   * students/student.controller.ts's `update`), so nothing new is needed
   * backend-side for this to work.
   */
  updateProfile: (
    profileType: ProfileType,
    avitag: string,
    patch: Record<string, unknown>,
  ) => Promise<Record<string, unknown> | undefined>;
  /**
   * Any admin (isIdiot, not king-only) — suspend/unsuspend/delete an
   * account. `status: "ACTIVE"` here only ever means "unsuspend" (the
   * backend rejects it unless the account is currently SUSPENDED — delete
   * is terminal, not undoable through this route). `reason` is optional
   * and only meaningful for SUSPENDED/DELETED, quoted back to the account
   * owner in their own blocked-login message.
   */
  updateAccountStatus: (
    accountId: string,
    status: "ACTIVE" | "SUSPENDED" | "DELETED",
    reason?: string,
  ) => Promise<void>;
  /**
   * POST /idiot/profiles/:type — an admin attaching a brand new profile to
   * someone's account. Distinct from updateProfile above: that one reuses
   * the consumer app's own per-type PUT routes (which only ever operate on
   * a profile that already exists); creating one for someone ELSE's
   * account has no self-service equivalent to reuse at all (every
   * self-service create() hard-codes the caller's own account_id) — see
   * KamposBackend's idiot/profiles.controller.ts create() doc comment.
   * `fields` is everything but account_id/avitag/profile type, which this
   * function threads through separately since every call site already
   * knows them structurally (account_id from the page it's called on,
   * avitag/profileType as their own params) rather than needing them
   * duplicated inside a loosely-typed bag.
   */
  createProfile: (
    profileType: ProfileType,
    accountId: string,
    avitag: string,
    fields: Record<string, unknown>,
  ) => Promise<Record<string, unknown> | undefined>;
  /** POST /idiot/users/:account_id/email — a one-off message an admin
   * writes on the Account Detail page (following up on a report, answering
   * a question). Sent via Brevo as a real branded email to the account's
   * own address; logged server-side to the audit trail with the subject
   * as the "reason" so a later admin can see one was sent without digging
   * up the actual email. */
  sendEmail: (accountId: string, subject: string, message: string) => Promise<void>;
}

export const useUserManagementStore = create<UserManagementState>((set) => ({
  loading: false,
  error: null,

  searchUsers: async (filters) => {
    set({ loading: true, error: null });
    try {
      const res = await api.get<ApiEnvelope<AccountSearchRow[]>>(
        `/idiot/users?${buildUserSearchQuery(filters)}`,
      );
      const rows = res.data?.data ?? [];
      set({ loading: false });
      return rows;
    } catch (err) {
      set({ error: apiErrorMessage(err, "Failed to search users"), loading: false });
      throw err;
    }
  },

  getAccount: async (accountId) => {
    set({ loading: true, error: null });
    try {
      const res = await api.get<ApiEnvelope<AccountDetail>>(`/idiot/users/${accountId}`);
      set({ loading: false });
      return res.data?.data;
    } catch (err) {
      set({ error: apiErrorMessage(err, "Failed to load account"), loading: false });
      throw err;
    }
  },

  createAccount: async (email, password) => {
    set({ loading: true, error: null });
    try {
      const res = await api.post<ApiEnvelope<CreatedAccount>>("/idiot/users", { email, password });
      set({ loading: false });
      return res.data?.data;
    } catch (err) {
      set({ error: apiErrorMessage(err, "Failed to create account"), loading: false });
      throw err;
    }
  },

  updateEmail: async (accountId, email) => {
    set({ loading: true, error: null });
    try {
      await api.patch(`/idiot/users/${accountId}/email`, { email });
      set({ loading: false });
    } catch (err) {
      set({ error: apiErrorMessage(err, "Failed to update email"), loading: false });
      throw err;
    }
  },

  updateProfile: async (profileType, avitag, patch) => {
    set({ loading: true, error: null });
    try {
      const segment = PROFILE_TYPE_PATH[profileType];
      const res = await api.put<ApiEnvelope<Record<string, unknown>>>(
        `/profiles/${segment}/${avitag}`,
        patch,
      );
      set({ loading: false });
      return res.data?.data;
    } catch (err) {
      set({ error: apiErrorMessage(err, "Failed to update profile"), loading: false });
      throw err;
    }
  },

  updateAccountStatus: async (accountId, status, reason) => {
    set({ loading: true, error: null });
    try {
      await api.patch(`/idiot/users/${accountId}/status`, { status, reason });
      set({ loading: false });
    } catch (err) {
      set({ error: apiErrorMessage(err, "Failed to update account status"), loading: false });
      throw err;
    }
  },

  createProfile: async (profileType, accountId, avitag, fields) => {
    set({ loading: true, error: null });
    try {
      const segment = PROFILE_TYPE_PATH[profileType];
      const res = await api.post<ApiEnvelope<Record<string, unknown>>>(`/idiot/profiles/${segment}`, {
        ...fields,
        account_id: accountId,
        avitag,
      });
      set({ loading: false });
      return res.data?.data;
    } catch (err) {
      set({ error: apiErrorMessage(err, "Failed to create profile"), loading: false });
      throw err;
    }
  },

  sendEmail: async (accountId, subject, message) => {
    set({ loading: true, error: null });
    try {
      await api.post(`/idiot/users/${accountId}/email`, { subject, message });
      set({ loading: false });
    } catch (err) {
      set({ error: apiErrorMessage(err, "Failed to send email"), loading: false });
      throw err;
    }
  },
}));
