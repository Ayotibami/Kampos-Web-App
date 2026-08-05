import axios, {
  type AxiosError,
  type AxiosInstance,
  type AxiosRequestConfig,
} from "axios";

/**
 * Shared axios client — talks to this app's own `/api/v1/...` proxy
 * (src/app/api/v1/[...path]/route.ts), not the backend directly.
 *
 * Auth lives in an httpOnly cookie set on the response to these calls.
 * Routing through this app's own domain (instead of hitting the backend's
 * origin straight from the browser) is what makes that cookie first-party
 * to this app — which is what lets the Server Components doing the auth
 * gate (see lib/serverAuth.ts) actually see it via `next/headers`. Calling
 * the backend directly here would still "work" for the browser, but the
 * cookie would belong to the backend's domain and never reach this app's
 * own server at all.
 */
export const api: AxiosInstance = axios.create({
  baseURL: "/api/v1",
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
