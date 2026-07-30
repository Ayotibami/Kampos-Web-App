import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { api, apiErrorMessage } from "@/lib/api";

/** Local image chosen in the wizard (object URL + metadata) for an
 * immediate preview — never persisted (an object URL dies with the page,
 * and the raw File can't be serialized into localStorage anyway). Once
 * `uploadAvatar` finishes, `imageUrl` (a plain string) takes over as the
 * thing that actually survives a reload. */
export interface PickedImage {
  uri: string;
  type?: string;
  name?: string;
}

interface SetupProfileData {
  first_name: string;
  last_name: string;
  campus_tag: string;
  major_tag: string;
  level: string;
  bio: string;
  avitag: string;
}

interface SetupProfileState {
  data: SetupProfileData;
  image: PickedImage | null;
  /** The real Cloudinary URL, once `uploadAvatar` resolves — this is what
   * actually persists across a reload and what gets submitted at the end. */
  imageUrl: string | null;
  uploadingImage: boolean;
  imageUploadError: string | null;
  /** Which step to show — persisted so returning later resumes here
   * instead of restarting from step 0. */
  currentStep: number;
  /** False until the persisted state has actually loaded from localStorage
   * (unavailable during SSR, so this is always false on the very first
   * render). `currentStep` directly decides which step component renders,
   * so without gating on this, a returning visitor would see a flash of
   * step 0 before jumping to wherever they actually left off. */
  hasHydrated: boolean;
  setHasHydrated: (value: boolean) => void;
  update: (patch: Partial<SetupProfileData>) => void;
  setImage: (image: PickedImage | null) => void;
  setStep: (step: number) => void;
  uploadAvatar: (file: Blob, name?: string) => Promise<string | undefined>;
  reset: () => void;
}

const EMPTY: SetupProfileData = {
  first_name: "",
  last_name: "",
  campus_tag: "",
  major_tag: "",
  level: "",
  bio: "",
  avitag: "",
};

/**
 * Persisted (localStorage) state for the multi-step profile-setup wizard —
 * so leaving mid-setup and coming back later resumes exactly where you left
 * off, instead of restarting. The picked-but-not-yet-uploaded image is the
 * one exception (see PickedImage above); everything else, including the
 * step you're on, survives a real reload.
 */
export const useSetupProfileStore = create<SetupProfileState>()(
  persist(
    (set) => ({
      data: { ...EMPTY },
      image: null,
      imageUrl: null,
      uploadingImage: false,
      imageUploadError: null,
      currentStep: 0,
      hasHydrated: false,
      setHasHydrated: (value) => set({ hasHydrated: value }),

      update: (patch) => set((s) => ({ data: { ...s.data, ...patch } })),
      setImage: (image) => set({ image }),
      setStep: (step) => set({ currentStep: step }),

      uploadAvatar: async (file, name) => {
        set({ uploadingImage: true, imageUploadError: null });
        try {
          const fd = new FormData();
          fd.append("image", file, name ?? "avatar.jpg");
          // This endpoint (like its /upload-picture sibling) responds with
          // a flat { success, url } — not the { success, data: {...} }
          // envelope most other endpoints use — so it's typed and read
          // directly, not through apiGet/ApiEnvelope.
          const res = await api.post<{ success: boolean; url?: string }>(
            "/profiles/avatar-preupload",
            fd,
            { headers: { "Content-Type": "multipart/form-data" } },
          );
          const url = res.data?.url;
          set({ imageUrl: url ?? null, uploadingImage: false });
          return url ?? undefined;
        } catch (err) {
          set({
            imageUploadError: apiErrorMessage(err, "Failed to upload photo"),
            uploadingImage: false,
          });
          return undefined;
        }
      },

      reset: () => set({ data: { ...EMPTY }, image: null, imageUrl: null, currentStep: 0, imageUploadError: null }),
    }),
    {
      name: "kampos.setup-profile",
      storage: createJSONStorage(() => localStorage),
      // `image` deliberately excluded — an object URL doesn't survive a
      // reload, and the raw File behind it can't be serialized at all.
      partialize: (state) => ({
        data: state.data,
        imageUrl: state.imageUrl,
        currentStep: state.currentStep,
      }),
      onRehydrateStorage: () => (state) => {
        // Runs once loading from localStorage actually finishes (or
        // immediately, if there was nothing to load) — either way, this is
        // the signal that `currentStep` now reflects reality.
        state?.setHasHydrated(true);
      },
    },
  ),
);
