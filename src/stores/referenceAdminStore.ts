import { create } from "zustand";
import { api, apiErrorMessage, type ApiEnvelope } from "@/lib/api";
import type { CampusRow, MajorRow } from "@/lib/serverReference";

interface ReferenceAdminState {
  loading: boolean;
  error: string | null;
  /**
   * Full re-fetch of both lists — used after every create/update/delete
   * so the screen reflects the backend's own resulting state, same
   * "re-fetch through the shared api client" split as every other
   * Group B/C admin store. Deliberately its own independent fetch rather
   * than reusing referenceStore.ts's fetchCampuses/fetchMajors: that store
   * caches aggressively (`if (campusesLoaded) return campuses`) for the
   * setup wizard's benefit, which would silently skip a real refetch here
   * right after this screen just changed the data.
   */
  refetch: () => Promise<{ campuses: CampusRow[]; majors: MajorRow[] }>;
  createCampus: (campus_tag: string, campus_name: string) => Promise<CampusRow>;
  updateCampus: (campus_tag: string, campus_name: string) => Promise<CampusRow>;
  deleteCampus: (campus_tag: string) => Promise<void>;
  createMajor: (major_tag: string, major_name: string) => Promise<MajorRow>;
  updateMajor: (major_tag: string, major_name: string) => Promise<MajorRow>;
  deleteMajor: (major_tag: string) => Promise<void>;
}

export const useReferenceAdminStore = create<ReferenceAdminState>((set) => ({
  loading: false,
  error: null,

  refetch: async () => {
    set({ loading: true, error: null });
    try {
      const [campusesRes, majorsRes] = await Promise.all([
        api.get<ApiEnvelope<CampusRow[]>>("/misc/campuses"),
        api.get<ApiEnvelope<MajorRow[]>>("/misc/majors"),
      ]);
      set({ loading: false });
      return { campuses: campusesRes.data?.data ?? [], majors: majorsRes.data?.data ?? [] };
    } catch (err) {
      set({ error: apiErrorMessage(err, "Failed to reload campuses/majors"), loading: false });
      throw err;
    }
  },

  createCampus: async (campus_tag, campus_name) => {
    set({ loading: true, error: null });
    try {
      const res = await api.post<ApiEnvelope<CampusRow>>("/idiot/reference/campuses", { campus_tag, campus_name });
      set({ loading: false });
      return res.data!.data!;
    } catch (err) {
      set({ error: apiErrorMessage(err, "Failed to create campus"), loading: false });
      throw err;
    }
  },

  updateCampus: async (campus_tag, campus_name) => {
    set({ loading: true, error: null });
    try {
      const res = await api.patch<ApiEnvelope<CampusRow>>(`/idiot/reference/campuses/${campus_tag}`, { campus_name });
      set({ loading: false });
      return res.data!.data!;
    } catch (err) {
      set({ error: apiErrorMessage(err, "Failed to update campus"), loading: false });
      throw err;
    }
  },

  deleteCampus: async (campus_tag) => {
    set({ loading: true, error: null });
    try {
      await api.delete(`/idiot/reference/campuses/${campus_tag}`);
      set({ loading: false });
    } catch (err) {
      set({ error: apiErrorMessage(err, "Failed to delete campus"), loading: false });
      throw err;
    }
  },

  createMajor: async (major_tag, major_name) => {
    set({ loading: true, error: null });
    try {
      const res = await api.post<ApiEnvelope<MajorRow>>("/idiot/reference/majors", { major_tag, major_name });
      set({ loading: false });
      return res.data!.data!;
    } catch (err) {
      set({ error: apiErrorMessage(err, "Failed to create major"), loading: false });
      throw err;
    }
  },

  updateMajor: async (major_tag, major_name) => {
    set({ loading: true, error: null });
    try {
      const res = await api.patch<ApiEnvelope<MajorRow>>(`/idiot/reference/majors/${major_tag}`, { major_name });
      set({ loading: false });
      return res.data!.data!;
    } catch (err) {
      set({ error: apiErrorMessage(err, "Failed to update major"), loading: false });
      throw err;
    }
  },

  deleteMajor: async (major_tag) => {
    set({ loading: true, error: null });
    try {
      await api.delete(`/idiot/reference/majors/${major_tag}`);
      set({ loading: false });
    } catch (err) {
      set({ error: apiErrorMessage(err, "Failed to delete major"), loading: false });
      throw err;
    }
  },
}));
