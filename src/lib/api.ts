import axios, {
  type AxiosError,
  type AxiosInstance,
  type AxiosRequestConfig,
} from "axios";
import { env } from "./env";

/**
 * Shared axios client for the Kampos backend.
 *
 * Auth now lives in httpOnly cookies set by the server (not a token this
 * app can read or store itself) — `withCredentials: true` is what makes
 * axios actually send/receive those cookies cross-origin. On a 401, we get
 * one shot at a silent refresh (`/auth/refresh`, which rotates the cookie
 * pair) before giving up and telling the rest of the app the session is
 * dead — a plain 401 doesn't necessarily mean "logged out," it might just
 * mean the short-lived access token expired mid-session.
 */
export const api: AxiosInstance = axios.create({
  baseURL: env.API_BASE,
  headers: { "Content-Type": "application/json" },
  timeout: 30_000,
  withCredentials: true,
});

/** Fired only once a 401 survives a refresh attempt — i.e. the session is
 * genuinely gone, not just mid-refresh. The auth gate listens for this. */
export const UNAUTHORIZED_EVENT = "kampos:unauthorized";

let refreshInFlight: Promise<boolean> | null = null;

async function tryRefresh(): Promise<boolean> {
  if (!refreshInFlight) {
    refreshInFlight = api
      .post("/auth/refresh")
      .then(() => true)
      .catch(() => false)
      .finally(() => {
        refreshInFlight = null;
      });
  }
  return refreshInFlight;
}

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const config = error.config as
      | (AxiosRequestConfig & { _retried?: boolean; skipUnauthorizedEvent?: boolean })
      | undefined;
    const isAuthRoute = config?.url?.includes("/auth/login") || config?.url?.includes("/auth/register") || config?.url?.includes("/auth/refresh");

    if (error.response?.status === 401 && config && !config._retried && !isAuthRoute) {
      config._retried = true;
      const refreshed = await tryRefresh();
      if (refreshed) {
        return api(config);
      }
      // Some callers (AuthGate's own "who am I" check) expect a 401 here as
      // a completely normal outcome — a guest visiting a guest-only page —
      // and already handle it themselves. Firing the global event for those
      // would mean the mere act of checking "are you logged in?" gets
      // mistaken for a real session dying mid-use and force-redirects you
      // off the very page you were trying to reach.
      if (typeof window !== "undefined" && !config.skipUnauthorizedEvent) {
        window.dispatchEvent(new CustomEvent(UNAUTHORIZED_EVENT));
      }
    }
    return Promise.reject(error);
  },
);

/** Standard backend envelope: `{ message, data }`. */
export interface ApiEnvelope<T> {
  message?: string;
  data?: T;
}

/** Pull a human-friendly message out of an axios error, with a fallback. */
export function apiErrorMessage(error: unknown, fallback: string): string {
  if (axios.isAxiosError(error)) {
    const data = error.response?.data as ApiEnvelope<unknown> | undefined;
    if (data?.message) return data.message;
    if (error.message === "Network Error") return "Abeg check your internet connection";
    return error.message || fallback;
  }
  if (error instanceof Error) return error.message || fallback;
  return fallback;
}

/** GET and return the unwrapped `data` field. */
export async function apiGet<T>(url: string, config?: AxiosRequestConfig): Promise<T | undefined> {
  const res = await api.get<ApiEnvelope<T>>(url, config);
  return res.data?.data;
}
