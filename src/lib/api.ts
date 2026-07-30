import axios, {
  type AxiosError,
  type AxiosInstance,
  type AxiosRequestConfig,
} from "axios";
import { env } from "./env";
import { getToken, clearSession } from "./session";

/**
 * Shared axios client for the Kampos backend.
 * - Injects the Bearer token synchronously from the session module.
 * - Normalizes error messages so callers get a friendly string.
 * - On 401, clears the session and notifies listeners (auth store subscribes).
 */
export const api: AxiosInstance = axios.create({
  baseURL: env.API_BASE,
  headers: { "Content-Type": "application/json" },
  timeout: 30_000,
});

api.interceptors.request.use((config) => {
  const token = getToken();
  if (token) {
    config.headers = config.headers ?? {};
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

/** Fired when the API returns 401 so the UI can redirect to login. */
export const UNAUTHORIZED_EVENT = "kampos:unauthorized";

api.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
    if (error.response?.status === 401) {
      clearSession();
      if (typeof window !== "undefined") {
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
  token?: string;
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
