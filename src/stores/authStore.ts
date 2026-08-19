import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import axios from "axios";
import type { AxiosRequestConfig } from "axios";
import { api, apiErrorMessage, type ApiEnvelope } from "@/lib/api";
import { normalizeProfileType, type Account, type ProfileType } from "@/types";

/**
 * The four states the whole app cares about. Computed server-side (from
 * `GET /account/profile`, the one trusted "who am I" source) every time
 * `resolveAuthState` runs — never inferred client-side from stale local
 * data, since that's exactly what let ungated pages be reachable before.
 */
export type AuthGateState =
  | "unknown"
  | "guest"
  | "needs-otp"
  | "needs-profile"
  | "active";

export interface ProfileSummary {
  avitag: string;
  profile_type?: string;
  [key: string]: unknown;
}

export interface AccountProfileResponse {
  account: Account | null;
  profiles: ProfileSummary[];
  /** The session's currently-active profile, baked into the JWT via
   * /auth/switch-profile — null whenever the account has profiles but none
   * of them has actually been switched to yet. */
  avitag: string | null;
  profileType: ProfileType | null;
}

interface AuthState {
  user: Account | null;
  profiles: ProfileSummary[];
  authState: AuthGateState;
  avitag: string | null;
  profileType: ProfileType | null;
  loading: boolean;
  error: string | null;

  setProfileMeta: (meta: {
    avitag?: string | null;
    profileType?: ProfileType | null;
  }) => void;
  /** Seeds the store from a gate check already done server-side (see
   * lib/serverAuth.ts) — no network call, just adopting data the page
   * already has from its own SSR fetch. Replaces what a client-side
   * resolveAuthState() call used to do on every page mount. */
  hydrateFromServer: (input: {
    state: AuthGateState;
    account: Account | null;
    profiles: ProfileSummary[];
  }) => void;

  register: (payload: {
    email: string;
    password: string;
  }) => Promise<AuthGateState>;
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
  /** Checks a password-reset code alone, no new password required — lets
   * the reset UI confirm the code before it swaps the code entry for the
   * new-password fields, same as verify-otp already does for signup. */
  verifyResetCode: (input: { email: string; code: string }) => Promise<void>;
  resetPassword: (input: {
    email: string;
    code: string;
    newPassword: string;
  }) => Promise<void>;
  /** Authenticated change-password (Account Management) — distinct from the
   * OTP-based forgotPassword/resetPassword flow above, which is for a
   * signed-out visitor who doesn't know their current password at all. */
  changePassword: (input: {
    currentPassword: string;
    newPassword: string;
  }) => Promise<void>;
  /** DELETE /account/delete — a soft delete server-side (account_status
   * flips to DELETED; the session itself isn't invalidated by the backend),
   * so this also clears local session state the same way logout does —
   * what the UI calls "Deactivate Account". */
  deactivateAccount: () => Promise<void>;
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
          profileType: normalizeProfileType(meta.profileType),
        }),

      hydrateFromServer: ({ state, account, profiles }) =>
        set({ user: account, profiles, authState: state, loading: false }),

      register: async (payload) => {
        set({ loading: true, error: null });
        try {
          // The server sets the auth cookies on this response directly —
          // there's no token in the body to store anymore. The account is
          // immediately "logged in" from here, just unverified.
          await api.post("/auth/register", payload);
          return await get().resolveAuthState();
        } catch (err) {
          set({
            error: apiErrorMessage(err, "Registration failed"),
            loading: false,
          });
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
          // skipUnauthorizedEvent: a 401 here just means "not logged in" —
          // the catch block below already turns that into the normal
          // "guest" state. Without this flag, api.ts's interceptor reads
          // the same 401 as a session dying mid-use and globally redirects
          // to /login, which is exactly wrong on a guest-only page like
          // /signup or /forgot-password (see SessionWatcher).
          const res = await api.get<ApiEnvelope<AccountProfileResponse>>(
            "/account/profile",
            {
              skipUnauthorizedEvent: true,
            } as AxiosRequestConfig,
          );
          const account = res.data?.data?.account ?? null;
          const profiles = res.data?.data?.profiles ?? [];
          let avitag = res.data?.data?.avitag ?? null;
          let profileType = normalizeProfileType(res.data?.data?.profileType);
          let authState: AuthGateState;
          if (!account) authState = "guest";
          else if (!account.is_otp_verified) authState = "needs-otp";
          else if (profiles.length === 0) authState = "needs-profile";
          else authState = "active";

          // Self-heal a session that owns a profile but never actually
          // switched to one — e.g. the switch-profile call at the end of
          // setup failed once and got silently swallowed, leaving every
          // authenticated write (react/comment/post) permanently rejecting
          // with "active profile required" despite the profile existing.
          // No UI anywhere lets someone manually switch, so this has to be
          // automatic, and it has to happen on every resolve (not just
          // once) so a transient failure here heals itself on next load
          // instead of getting stuck the same way again.
          if (authState === "active" && !avitag && profiles[0]?.avitag) {
            try {
              const switchRes = await api.post<
                ApiEnvelope<{ avitag: string; profileType: ProfileType }>
              >("/auth/switch-profile", { avitag: profiles[0].avitag });
              avitag = switchRes.data?.data?.avitag ?? null;
              profileType = normalizeProfileType(
                switchRes.data?.data?.profileType,
              );
            } catch {
              // Leave avitag null — this resolve will just retry next time.
            }
          }

          set({
            user: account,
            profiles,
            authState,
            avitag,
            profileType,
            loading: false,
          });
          return authState;
        } catch (err) {
          // A confirmed 401 (genuine session expiry after a failed refresh)
          // means the user really does need to log back in — clear state.
          // Network errors and 5xx (backend temporarily unreachable) are a
          // different story: the session is likely still valid, so preserve
          // the current store state rather than falsely marking the user as
          // a guest just because the backend happened to be cold-starting.
          //
          // The _refreshUnavailable flag is set by api.ts's interceptor when
          // the refresh attempt itself couldn't reach the backend (network
          // error, timeout, 5xx). Without checking it here, this catch block
          // would see the original 401 (from the expired access token) and
          // wrongly conclude the session is dead — logging the user out just
          // because Render was cold-starting.
          if (axios.isAxiosError(err)) {
            const cfg = err.config as
              | (AxiosRequestConfig & { _refreshUnavailable?: boolean })
              | undefined;
            const isConfirmedExpiry =
              err.response?.status === 401 && !cfg?._refreshUnavailable;
            if (isConfirmedExpiry) {
              set({
                user: null,
                profiles: [],
                authState: "guest",
                loading: false,
              });
              return "guest";
            }
          }
          // Backend unreachable — don't change authState, just stop loading.
          set({ loading: false });
          return get().authState;
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
          set({
            error: apiErrorMessage(err, "Failed to send OTP"),
            loading: false,
          });
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
          set({
            error: apiErrorMessage(err, "Failed to send OTP code"),
            loading: false,
          });
          throw err;
        }
      },

      verifyResetCode: async ({ email, code }) => {
        set({ loading: true, error: null });
        try {
          await api.post("/auth/verify-reset-code", { email, code });
          set({ loading: false });
        } catch (err) {
          set({ error: apiErrorMessage(err, "Invalid code"), loading: false });
          throw err;
        }
      },

      resetPassword: async ({ email, code, newPassword }) => {
        set({ loading: true, error: null });
        try {
          await api.post("/auth/reset-password", { email, code, newPassword });
          set({ loading: false });
        } catch (err) {
          set({
            error: apiErrorMessage(err, "Failed to reset password"),
            loading: false,
          });
          throw err;
        }
      },

      changePassword: async ({ currentPassword, newPassword }) => {
        set({ loading: true, error: null });
        try {
          await api.patch("/account/change-password", {
            currentPassword,
            newPassword,
          });
          set({ loading: false });
        } catch (err) {
          set({
            error: apiErrorMessage(err, "Failed to change password"),
            loading: false,
          });
          throw err;
        }
      },

      deactivateAccount: async () => {
        set({ loading: true, error: null });
        try {
          await api.delete("/account/delete");
        } catch (err) {
          set({
            error: apiErrorMessage(err, "Failed to deactivate account"),
            loading: false,
          });
          throw err;
        }
        // Best-effort, same as logout() below — the account row is already
        // flagged server-side by this point regardless of whether this call
        // itself succeeds.
        try {
          await api.post("/auth/logout");
        } catch {
          /* best-effort */
        }
        set({
          user: null,
          profiles: [],
          authState: "guest",
          avitag: null,
          profileType: null,
          loading: false,
          error: null,
        });
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
