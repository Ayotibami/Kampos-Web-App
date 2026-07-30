import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { api, apiErrorMessage, type ApiEnvelope } from "@/lib/api";
import { getToken, setToken, clearSession } from "@/lib/session";
import type { Account, ProfileType } from "@/types";

interface AuthState {
  token: string | null;
  user: Account | null;
  avitag: string | null;
  profileType: ProfileType | null;
  loading: boolean;
  error: string | null;

  // session helpers used across stores
  setSession: (token: string | null) => void;
  setProfileMeta: (meta: { avitag?: string | null; profileType?: ProfileType | null }) => void;

  register: (payload: { email: string; password: string }) => Promise<{ token: string | null; user: Account | null }>;
  login: (creds: { email: string; password: string }) => Promise<{ token: string | null; user: Account | null }>;
  fetchMe: () => Promise<Account | null>;
  sendOtp: (email: string) => Promise<void>;
  verifyOtp: (input: { email: string; code: string }) => Promise<unknown>;
  forgotPassword: (email: string) => Promise<void>;
  resetPassword: (input: { email: string; code: string; newPassword: string }) => Promise<void>;
  logout: () => Promise<void>;
}

type AuthResponse = ApiEnvelope<{ token?: string; account?: Account }> & {
  token?: string;
  account?: Account;
};

// The backend has returned the token/account at either the top level or under
// `data` across versions — read both, like mobile did.
function extractAuth(payload: AuthResponse | undefined) {
  const token = payload?.data?.token ?? payload?.token ?? null;
  const account = payload?.data?.account ?? payload?.account ?? null;
  return { token, account };
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      token: getToken(),
      user: null,
      avitag: null,
      profileType: null,
      loading: false,
      error: null,

      setSession: (token) => {
        setToken(token);
        set({ token });
      },
      setProfileMeta: (meta) =>
        set({
          avitag: meta.avitag ?? null,
          profileType: meta.profileType ?? null,
        }),

      register: async (payload) => {
        set({ loading: true, error: null });
        try {
          const res = await api.post<AuthResponse>("/auth/register", payload);
          const { token, account } = extractAuth(res.data);
          get().setSession(token);
          set({ user: account, loading: false });
          return { token, user: account };
        } catch (err) {
          set({ error: apiErrorMessage(err, "Registration failed"), loading: false });
          throw err;
        }
      },

      login: async (creds) => {
        set({ loading: true, error: null });
        try {
          const res = await api.post<AuthResponse>("/auth/login", creds);
          const { token, account } = extractAuth(res.data);
          get().setSession(token);
          set({ user: account, loading: false });
          return { token, user: account };
        } catch (err) {
          set({ error: apiErrorMessage(err, "Login failed"), loading: false });
          throw err;
        }
      },

      fetchMe: async () => {
        set({ loading: true, error: null });
        try {
          const res = await api.get<ApiEnvelope<Account>>("/account/profile");
          const account = res.data?.data ?? null;
          set({ user: account, loading: false });
          return account;
        } catch (err) {
          set({ error: apiErrorMessage(err, "Failed to fetch profile"), loading: false });
          throw err;
        }
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
          const res = await api.post<ApiEnvelope<unknown>>("/auth/verify-otp", { email, code });
          set({ loading: false });
          return res.data?.data;
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
          /* best-effort */
        }
        clearSession();
        set({ token: null, user: null, avitag: null, profileType: null, error: null });
      },
    }),
    {
      name: "kampos.auth",
      storage: createJSONStorage(() => localStorage),
      // Token lives in the session module (not persisted here); only mirror meta.
      partialize: (state) => ({
        user: state.user,
        avitag: state.avitag,
        profileType: state.profileType,
      }),
    },
  ),
);
