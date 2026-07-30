import { create } from "zustand";
import { apiGet } from "@/lib/api";
// Backend's up now — fetch for real instead of seeding these. Commented
// out (not deleted) in case we want the instant-default-data UX back later.
// import { DEFAULT_CAMPUSES } from "@/lib/defaultCampuses";
// import { DEFAULT_MAJORS } from "@/lib/defaultMajors";
import type { CampusOption, Major } from "@/types";

interface RawCampus {
  campus_name: string;
  campus_tag: string;
}

interface ReferenceState {
  campuses: CampusOption[];
  majors: Major[];
  campusesLoaded: boolean;
  majorsLoaded: boolean;
  loadingCampuses: boolean;
  loadingMajors: boolean;
  error: string | null;
  fetchCampuses: () => Promise<CampusOption[]>;
  fetchMajors: () => Promise<Major[]>;
}

/**
 * Reference data (campuses + majors) used by the profile-setup wizard.
 * Fetched live from /misc/campuses and /misc/majors — no seeded defaults
 * right now, so the school/academics steps show their loading state until
 * the real data arrives. Cached after first successful load so re-entering
 * steps doesn't refetch.
 */
export const useReferenceStore = create<ReferenceState>((set, get) => ({
  campuses: [],
  majors: [],
  campusesLoaded: false,
  majorsLoaded: false,
  loadingCampuses: false,
  loadingMajors: false,
  error: null,

  fetchCampuses: async () => {
    if (get().campusesLoaded) return get().campuses;
    set({ loadingCampuses: true, error: null });
    try {
      const raw = (await apiGet<RawCampus[]>("/misc/campuses")) ?? [];
      const campuses: CampusOption[] = raw.map((c) => ({
        label: `${c.campus_name} (${c.campus_tag.toUpperCase()})`,
        tag: c.campus_tag,
      }));
      set({ campuses, campusesLoaded: true, loadingCampuses: false });
      return campuses;
    } catch (err) {
      set({ loadingCampuses: false, error: "Failed to load campuses" });
      throw err;
    }
  },

  fetchMajors: async () => {
    if (get().majorsLoaded) return get().majors;
    set({ loadingMajors: true, error: null });
    try {
      const majors = (await apiGet<Major[]>("/misc/majors")) ?? [];
      set({ majors, majorsLoaded: true, loadingMajors: false });
      return majors;
    } catch (err) {
      set({ loadingMajors: false, error: "Failed to load majors" });
      throw err;
    }
  },
}));
