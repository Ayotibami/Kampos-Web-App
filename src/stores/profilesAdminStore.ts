import { create } from "zustand";
import { api, apiErrorMessage, type ApiEnvelope } from "@/lib/api";
import { buildProfileAdminQuery, type ProfileAdminFilters } from "@/lib/profilesAdminQuery";
import { PROFILE_TYPE_PATH } from "@/lib/profileEditFields";
import type {
  StudentProfileRow,
  KreatorProfileRow,
  KompanyProfileRow,
  SchoolProfileRow,
  IdiotProfileRow,
} from "@/lib/serverProfilesAdmin";
import type { ProfileType } from "@/types";

export type {
  ProfileAdminFilters,
  StudentProfileRow,
  KreatorProfileRow,
  KompanyProfileRow,
  SchoolProfileRow,
  IdiotProfileRow,
};

interface ProfilesAdminState {
  loading: boolean;
  error: string | null;
  /** Client-side re-search/scroll-continuation for each of the 5 tabs — used
   * for both a fresh filter search (no cursor) and a scroll continuation
   * (cursor = the last-seen row's own avitag), same split as
   * allGistsStore's fetchGists vs serverGistsAdmin's listGists. */
  fetchStudents: (filters: ProfileAdminFilters) => Promise<StudentProfileRow[]>;
  fetchKreators: (filters: ProfileAdminFilters) => Promise<KreatorProfileRow[]>;
  fetchKompanies: (filters: ProfileAdminFilters) => Promise<KompanyProfileRow[]>;
  fetchSchools: (filters: ProfileAdminFilters) => Promise<SchoolProfileRow[]>;
  fetchIdiots: (filters: ProfileAdminFilters) => Promise<IdiotProfileRow[]>;
  /**
   * Verify/ban/delete — NEW actions this section needs beyond what
   * userManagementStore already has (that store only ever needed
   * updateProfile, since the account detail page has no verify/ban/delete
   * UI of its own). Editing itself is NOT duplicated here — the full-page
   * profile editor calls userManagementStore.updateProfile directly, the
   * exact same PUT /profiles/<type>/:avitag call this store would otherwise
   * have to duplicate.
   */
  verifyProfile: (profileType: ProfileType, avitag: string) => Promise<void>;
  /** Reverses verifyProfile — same per-type routes, PATCH .../unverify. Lets
   * the Profiles tabs toggle a verified profile back to unverified (e.g. a
   * mistaken verify), which the moderation queue's own one-way approve flow
   * has no equivalent for. */
  unverifyProfile: (profileType: ProfileType, avitag: string) => Promise<void>;
  /** Admin-only, PATCH .../ban — takes this ONE profile offline (own page
   * 404s, can't post/comment/edit as it) without touching the rest of the
   * account. Only an admin can lift it (unbanProfile below) — mirrors
   * account-level suspend, just scoped to one persona. `reason` is
   * optional, quoted back to the profile's owner. */
  banProfile: (profileType: ProfileType, avitag: string, reason?: string) => Promise<void>;
  unbanProfile: (profileType: ProfileType, avitag: string) => Promise<void>;
  /** Soft delete (see KamposBackend's students/repo.ts softDelete doc
   * comment for why this replaced a hard row DELETE) — either the owner or
   * an admin can trigger it; `reason` is optional and only meaningful when
   * an admin is the one deleting someone else's profile. */
  deleteProfile: (profileType: ProfileType, avitag: string, reason?: string) => Promise<void>;
}

/**
 * Client-side counterpart to lib/serverProfilesAdmin.ts for
 * /villagepeople/profiles — same "server does the initial fetch per tab,
 * this store owns every filter change/scroll continuation/verify/delete
 * from here on" split as every other Group B/C store in this section.
 * Cursor-based (avitag), NOT offset-based — see profilesAdminQuery.ts's own
 * doc comment for why this mirrors AllGistsManager's mechanism rather than
 * UsersManager's offset heuristic.
 */
export const useProfilesAdminStore = create<ProfilesAdminState>((set) => ({
  loading: false,
  error: null,

  fetchStudents: async (filters) => {
    const query = buildProfileAdminQuery(filters);
    const res = await api.get<ApiEnvelope<StudentProfileRow[]>>(
      `/idiot/profiles/students${query ? `?${query}` : ""}`,
    );
    return res.data?.data ?? [];
  },

  fetchKreators: async (filters) => {
    const query = buildProfileAdminQuery(filters);
    const res = await api.get<ApiEnvelope<KreatorProfileRow[]>>(
      `/idiot/profiles/kreators${query ? `?${query}` : ""}`,
    );
    return res.data?.data ?? [];
  },

  fetchKompanies: async (filters) => {
    const query = buildProfileAdminQuery(filters);
    const res = await api.get<ApiEnvelope<KompanyProfileRow[]>>(
      `/idiot/profiles/kompanies${query ? `?${query}` : ""}`,
    );
    return res.data?.data ?? [];
  },

  fetchSchools: async (filters) => {
    const query = buildProfileAdminQuery(filters);
    const res = await api.get<ApiEnvelope<SchoolProfileRow[]>>(
      `/idiot/profiles/schools${query ? `?${query}` : ""}`,
    );
    return res.data?.data ?? [];
  },

  fetchIdiots: async (filters) => {
    const query = buildProfileAdminQuery(filters);
    const res = await api.get<ApiEnvelope<IdiotProfileRow[]>>(
      `/idiot/profiles/idiots${query ? `?${query}` : ""}`,
    );
    return res.data?.data ?? [];
  },

  verifyProfile: async (profileType, avitag) => {
    set({ loading: true, error: null });
    try {
      const segment = PROFILE_TYPE_PATH[profileType];
      await api.patch(`/profiles/${segment}/${avitag}/verify`);
      set({ loading: false });
    } catch (err) {
      set({ error: apiErrorMessage(err, "Failed to verify profile"), loading: false });
      throw err;
    }
  },

  unverifyProfile: async (profileType, avitag) => {
    set({ loading: true, error: null });
    try {
      const segment = PROFILE_TYPE_PATH[profileType];
      await api.patch(`/profiles/${segment}/${avitag}/unverify`);
      set({ loading: false });
    } catch (err) {
      set({ error: apiErrorMessage(err, "Failed to unverify profile"), loading: false });
      throw err;
    }
  },

  banProfile: async (profileType, avitag, reason) => {
    set({ loading: true, error: null });
    try {
      const segment = PROFILE_TYPE_PATH[profileType];
      await api.patch(`/profiles/${segment}/${avitag}/ban`, { reason });
      set({ loading: false });
    } catch (err) {
      set({ error: apiErrorMessage(err, "Failed to ban profile"), loading: false });
      throw err;
    }
  },

  unbanProfile: async (profileType, avitag) => {
    set({ loading: true, error: null });
    try {
      const segment = PROFILE_TYPE_PATH[profileType];
      await api.patch(`/profiles/${segment}/${avitag}/unban`);
      set({ loading: false });
    } catch (err) {
      set({ error: apiErrorMessage(err, "Failed to unban profile"), loading: false });
      throw err;
    }
  },

  deleteProfile: async (profileType, avitag, reason) => {
    set({ loading: true, error: null });
    try {
      const segment = PROFILE_TYPE_PATH[profileType];
      await api.delete(`/profiles/${segment}/${avitag}/delete`, { data: { reason } });
      set({ loading: false });
    } catch (err) {
      set({ error: apiErrorMessage(err, "Failed to delete profile"), loading: false });
      throw err;
    }
  },
}));
