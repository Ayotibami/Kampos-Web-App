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

/** "refreshed"    = new tokens issued; retry the original request.
 *  "expired"      = the refresh token itself is dead; session is genuinely gone.
 *  "unavailable"  = backend temporarily unreachable (cold-start, 5xx, timeout);
 *                   don't log the user out — their session is still valid. */
type RefreshOutcome = "refreshed" | "expired" | "unavailable";
let refreshInFlight: Promise<RefreshOutcome> | null = null;

async function tryRefresh(): Promise<RefreshOutcome> {
  if (!refreshInFlight) {
    refreshInFlight = api
      .post("/auth/refresh")
      .then((): RefreshOutcome => "refreshed")
      .catch((err: unknown): RefreshOutcome => {
        if (axios.isAxiosError(err)) {
          const status = err.response?.status;
          // 401/403 = the refresh token itself has expired or been revoked.
          // Everything else (network error, 502 Render cold-start, timeout)
          // means the backend is temporarily unavailable — not a dead session.
          if (status === 401 || status === 403) return "expired";
        }
        return "unavailable";
      })
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
      | (AxiosRequestConfig & {
          _retried?: boolean;
          skipUnauthorizedEvent?: boolean;
        })
      | undefined;
    const isAuthRoute =
      config?.url?.includes("/auth/login") ||
      config?.url?.includes("/auth/register") ||
      config?.url?.includes("/auth/refresh");

    if (
      error.response?.status === 401 &&
      config &&
      !config._retried &&
      !isAuthRoute
    ) {
      config._retried = true;
      const refreshOutcome = await tryRefresh();
      if (refreshOutcome === "refreshed") {
        return api(config);
      }
      // Only tell the UI the session is dead when the refresh endpoint itself
      // confirms it with a 401/403 — not on transient backend unavailability
      // (Render cold-starts, timeouts, 5xx) which look like failures but
      // leave the session perfectly intact.
      if (
        refreshOutcome === "expired" &&
        typeof window !== "undefined" &&
        !config.skipUnauthorizedEvent
      ) {
        window.dispatchEvent(new CustomEvent(UNAUTHORIZED_EVENT));
      }
      if (refreshOutcome === "unavailable") {
        // Mark the error so callers (especially resolveAuthState) can tell
        // the difference between "refresh returned 401 — session genuinely
        // dead" and "refresh couldn't even reach the backend — session is
        // probably still valid, just temporarily unreachable." Without this
        // flag, resolveAuthState sees the original 401 (from the expired
        // access token) and wrongly concludes the session is gone.
        (
          config as AxiosRequestConfig & { _refreshUnavailable?: boolean }
        )._refreshUnavailable = true;
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

/**
 * Pull a human-friendly message out of an error, with a fallback — and
 * only ever a curated one. `data?.message` is safe to show verbatim
 * because the backend's own error handler guarantees it's always a
 * friendly, authored string, never a raw driver/exception message (see
 * KamposBackend's errorHandler/GENERIC_MESSAGE). Everything past that is
 * text axios or the JS runtime generated on its own — a raw driver/network
 * message ("timeout of 30000ms exceeded", "Request failed with status code
 * 502", a CORS/proxy failure with no JSON body at all, some browser API's
 * own internal exception text) — none of which was ever written for a
 * real user to read. Previously this fell through to that raw text
 * whenever it existed, which defeated the whole point of callers passing
 * their own `fallback`; now every one of those cases uses it instead.
 */
export function apiErrorMessage(error: unknown, fallback: string): string {
  if (axios.isAxiosError(error)) {
    const data = error.response?.data as ApiEnvelope<unknown> | undefined;
    if (data?.message) return data.message;
    if (error.message === "Network Error" || error.code === "ECONNABORTED") {
      return "Abeg check your internet connection";
    }
    return fallback;
  }
  return fallback;
}

/** GET and return the unwrapped `data` field. */
export async function apiGet<T>(
  url: string,
  config?: AxiosRequestConfig,
): Promise<T | undefined> {
  const res = await api.get<ApiEnvelope<T>>(url, config);
  return res.data?.data;
}
