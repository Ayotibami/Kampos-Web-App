import { create } from "zustand";
import { api, apiErrorMessage, type ApiEnvelope } from "@/lib/api";
import { useAuthStore } from "./authStore";
import type { Profile, ProfileType, StudentProfilePayload } from "@/types";

interface SwitchResult {
  avitag: string | null;
  profileType: ProfileType | null;
}

interface ProfileState {
  loading: boolean;
  error: string | null;
  switchProfile: (avitag: string) => Promise<SwitchResult>;
  createStudentProfile: (
    payload: StudentProfilePayload,
    imageUrl?: string | null,
  ) => Promise<Profile | undefined>;
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
}));
