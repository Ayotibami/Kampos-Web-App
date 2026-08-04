import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { api, apiErrorMessage, type ApiEnvelope } from "@/lib/api";
import type { Account, ProfileType } from "@/types";

/**
 * The four states the whole app cares about. Computed server-side (from
 * `GET /account/profile`, the one trusted "who am I" source) every time
 * `resolveAuthState` runs — never inferred client-side from stale local
 * data, since that's exactly what let ungated pages be reachable before.
 */
export type AuthGateState = "unknown" | "guest" | "needs-otp" | "needs-profile" | "active";

interface ProfileSummary {
  avitag: string;
  profile_type?: string;
  [key: string]: unknown;
}

interface AccountProfileResponse {
  account: Account | null;
  profiles: ProfileSummary[];
}

interface AuthState {
  user: Account | null;
  profiles: ProfileSummary[];
  authState: AuthGateState;
  avitag: string | null;
  profileType: ProfileType | null;
  loading: boolean;
  error: string | null;

  setProfileMeta: (meta: { avitag?: string | null; profileType?: ProfileType | null }) => void;

  register: (payload: { email: string; password: string }) => Promise<AuthGateState>;
  login: (creds: { email: string; password: string }) => Promise<AuthGateState>;
  /** The single source of truth — hits the backend, derives the gate
   * state from the real account + profile rows, and stores both. Every
   * page-load gate check and every post-auth-action redirect goes through
   * this, so "where do I send this user" is decided in exactly one place. */
  resolveAuthState: () => Promise<AuthGateState>;
  /** Thin alias kept for callers that just want the account, not the full
   * gate resolution — delegates to resolveAuthState under the hood. */
  fetchMe: () => Promise<Account | null>;
  sendOtp: (email: string) => Promise<void>;
  verifyOtp: (input: { email: string; code: string }) => Promise<AuthGateState>;
  forgotPassword: (email: string) => Promise<void>;
  resetPassword: (input: { email: string; code: string; newPassword: string }) => Promise<void>;
  logout: () => Promise<void>;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      profiles: [],
      authState: "unknown",
      avitag: null,
      profileType: null,
      loading: false,
      error: null,

      setProfileMeta: (meta) =>
        set({
          avitag: meta.avitag ?? null,
          profileType: meta.profileType ?? null,
        }),

      register: async (payload) => {
        set({ loading: true, error: null });
        try {
          // The server sets the auth cookies on this response directly —
          // there's no token in the body to store anymore. The account is
          // immediately "logged in" from here, just unverified.
          await api.post("/auth/register", payload);
          return await get().resolveAuthState();
        } catch (err) {
          set({ error: apiErrorMessage(err, "Registration failed"), loading: false });
          throw err;
        }
      },

      login: async (creds) => {
        set({ loading: true, error: null });
        try {
          await api.post("/auth/login", creds);
          return await get().resolveAuthState();
        } catch (err) {
          set({ error: apiErrorMessage(err, "Login failed"), loading: false });
          throw err;
        }
      },

      resolveAuthState: async () => {
        set({ loading: true, error: null });
        try {
          const res = await api.get<ApiEnvelope<AccountProfileResponse>>("/account/profile");
          const account = res.data?.data?.account ?? null;
          const profiles = res.data?.data?.profiles ?? [];
          let authState: AuthGateState;
          if (!account) authState = "guest";
          else if (!account.is_otp_verified) authState = "needs-otp";
          else if (profiles.length === 0) authState = "needs-profile";
          else authState = "active";
          set({ user: account, profiles, authState, loading: false });
          return authState;
        } catch {
          // No valid session (401), or the backend's unreachable — either
          // way, there's no confirmed identity, so treat as guest rather
          // than leaving stale user data lying around in the store.
          set({ user: null, profiles: [], authState: "guest", loading: false });
          return "guest";
        }
      },

      fetchMe: async () => {
        await get().resolveAuthState();
        return get().user;
      },

      sendOtp: async (email) => {
        set({ loading: true, error: null });
        try {
          await api.post("/auth/verify-otp/send", { email });
          set({ loading: false });
        } catch (err) {
          set({ error: apiErrorMessage(err, "Failed to send OTP"), loading: false });
          throw err;
        }
      },

      verifyOtp: async ({ email, code }) => {
        set({ loading: true, error: null });
        try {
          await api.post("/auth/verify-otp", { email, code });
          // Verifying doesn't hand back a new token — the session cookie
          // from register/login is already valid, only the DB row's
          // is_otp_verified flag changed. Re-resolving picks that up and
          // naturally advances the gate state to needs-profile/active.
          return await get().resolveAuthState();
        } catch (err) {
          set({ error: apiErrorMessage(err, "Invalid code"), loading: false });
          throw err;
        }
      },

      forgotPassword: async (email) => {
        set({ loading: true, error: null });
        try {
          await api.post("/auth/forgot-password", { email });
          set({ loading: false });
        } catch (err) {
          set({ error: apiErrorMessage(err, "Failed to send OTP code"), loading: false });
          throw err;
        }
      },

      resetPassword: async ({ email, code, newPassword }) => {
        set({ loading: true, error: null });
        try {
          await api.post("/auth/reset-password", { email, code, newPassword });
          set({ loading: false });
        } catch (err) {
          set({ error: apiErrorMessage(err, "Failed to reset password"), loading: false });
          throw err;
        }
      },

      logout: async () => {
        try {
          await api.post("/auth/logout");
        } catch {
          /* best-effort — cookies get cleared server-side on success; if
           * the request itself failed, the cookies may outlive this call,
           * but the local store treating the session as gone is still the
           * right call from the UI's perspective. */
        }
        set({
          user: null,
          profiles: [],
          authState: "guest",
          avitag: null,
          profileType: null,
          error: null,
        });
      },
    }),
    {
      name: "kampos.auth",
      storage: createJSONStorage(() => localStorage),
      // user/profiles/authState are deliberately NOT persisted — they're
      // re-derived from the backend on every gate check, so a stale copy
      // here would just be actively misleading. Only the active-profile
      // selection (avitag/profileType) is worth remembering across reloads.
      partialize: (state) => ({
        avitag: state.avitag,
        profileType: state.profileType,
      }),
    },
  ),
);
