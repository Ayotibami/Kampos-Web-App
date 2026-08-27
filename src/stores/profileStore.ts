import { create } from "zustand";
import { api, apiErrorMessage, type ApiEnvelope } from "@/lib/api";
import { cacheGet, cacheSet, cacheDelete } from "@/lib/dataCache";
import { useAuthStore } from "./authStore";
import type { Profile, ProfileType, StudentProfilePayload } from "@/types";

interface SwitchResult {
  avitag: string | null;
  profileType: ProfileType | null;
}

/** The subset of a student profile Settings actually edits. */
export interface StudentProfileUpdate {
  first_name?: string;
  last_name?: string;
  level?: number;
  bio?: string;
  image_url?: string;
}

interface ProfileState {
  loading: boolean;
  error: string | null;
  switchProfile: (avitag: string) => Promise<SwitchResult>;
  createStudentProfile: (
    payload: StudentProfilePayload,
    imageUrl?: string | null,
  ) => Promise<Profile | undefined>;
  /** GET /profiles/students/:avitag — public, no auth required, but only
   * ever called here for the signed-in user's own avitag (Profile Settings). */
  getStudentProfile: (avitag: string) => Promise<Profile | undefined>;
  /** PUT /profiles/students/:avitag — partial update, only the provided
   * keys are written. Ownership is enforced server-side (403 otherwise). */
  updateStudentProfile: (avitag: string, patch: StudentProfileUpdate) => Promise<Profile | undefined>;
}

/** Append scalar/array fields to FormData the same way mobile does. */
function appendFields(fd: FormData, payload: Record<string, unknown>) {
  for (const [key, value] of Object.entries(payload)) {
    if (value === undefined || value === null) continue;
    fd.append(key, Array.isArray(value) ? JSON.stringify(value) : String(value));
  }
}

export const useProfileStore = create<ProfileState>((set, get) => ({
  loading: false,
  error: null,

  switchProfile: async (avitag) => {
    set({ loading: true, error: null });
    try {
      // Switching profiles rotates the auth cookies server-side (new
      // active-profile claims baked into a fresh token pair) — nothing to
      // store client-side beyond the avitag/profileType meta below.
      const res = await api.post<ApiEnvelope<SwitchResult>>("/auth/switch-profile", { avitag });
      const data = res.data?.data;
      const newAvitag = data?.avitag ?? null;
      const profileType = data?.profileType ?? null;

      useAuthStore.getState().setProfileMeta({ avitag: newAvitag, profileType });

      set({ loading: false });
      return { avitag: newAvitag, profileType };
    } catch (err) {
      set({ error: apiErrorMessage(err, "Switch profile failed"), loading: false });
      throw err;
    }
  },

  createStudentProfile: async (payload, imageUrl) => {
    set({ loading: true, error: null });
    try {
      // The avatar is already uploaded by this point (setupProfileStore's
      // uploadAvatar, fired the moment it was picked, not held as a raw
      // file until now) — just pass the URL along as a plain field, same
      // as the backend's own image_url fallback for profile creation.
      const fd = new FormData();
      appendFields(fd, { ...payload, ...(imageUrl ? { image_url: imageUrl } : {}) } as unknown as Record<
        string,
        unknown
      >);

      const res = await api.post<ApiEnvelope<Profile>>("/profiles/students", fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      const created = res.data?.data;

      if (created?.avitag) {
        try {
          await get().switchProfile(created.avitag);
        } catch {
          /* profile created; switch can be retried on next login */
        }
      }
      set({ loading: false });
      return created;
    } catch (err) {
      set({ error: apiErrorMessage(err, "Create student profile failed"), loading: false });
      throw err;
    }
  },

  getStudentProfile: async (avitag) => {
    const key = `GET:/profiles/students/${avitag}`;
    set({ loading: true, error: null });
    try {
      // Cache-first: if we have a fresh cached profile (≤5min), return it
      // immediately and refresh in the background.
      const cached = await cacheGet<Profile>(key);
      if (cached) {
        set({ loading: false });
        api.get<ApiEnvelope<Profile>>(`/profiles/students/${avitag}`)
          .then((r) => { if (r.data?.data) cacheSet(key, r.data.data); })
          .catch(() => {});
        return cached;
      }
      const res = await api.get<ApiEnvelope<Profile>>(`/profiles/students/${avitag}`);
      const profile = res.data?.data;
      if (profile) cacheSet(key, profile);
      set({ loading: false });
      return profile;
    } catch (err) {
      set({ error: apiErrorMessage(err, "Failed to load profile"), loading: false });
      throw err;
    }
  },

  updateStudentProfile: async (avitag, patch) => {
    set({ loading: true, error: null });
    try {
      const res = await api.put<ApiEnvelope<Profile>>(`/profiles/students/${avitag}`, patch);
      cacheDelete(`GET:/profiles/students/${avitag}`).catch(() => {});
      set({ loading: false });
      return res.data?.data;
    } catch (err) {
      set({ error: apiErrorMessage(err, "Failed to update profile"), loading: false });
      throw err;
    }
  },
}));
