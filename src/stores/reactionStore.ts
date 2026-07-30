import { create } from "zustand";
import { api, apiGet, apiErrorMessage, type ApiEnvelope } from "@/lib/api";
import type { Reaction, ReactionEntity, ReactionType } from "@/types";

interface ReactionState {
  loading: boolean;
  error: string | null;
  upsert: (input: {
    entity_type: ReactionEntity;
    entity_id: string;
    type: ReactionType;
  }) => Promise<Reaction | undefined>;
  listByEntity: (entityType: ReactionEntity, entityId: string) => Promise<Reaction[]>;
  removeByEntity: (entityType: ReactionEntity, entityId: string) => Promise<void>;
}

export const useReactionStore = create<ReactionState>((set) => ({
  loading: false,
  error: null,

  upsert: async ({ entity_type, entity_id, type }) => {
    try {
      const res = await api.post<ApiEnvelope<Reaction>>("/reactions", {
        entity_type,
        entity_id,
        type,
      });
      return res.data?.data;
    } catch (err) {
      set({ error: apiErrorMessage(err, "Failed to react") });
      throw err;
    }
  },

  listByEntity: async (entityType, entityId) => {
    try {
      return (
        (await apiGet<Reaction[]>(
          `/reactions/entity/${encodeURIComponent(entityType)}/${encodeURIComponent(entityId)}`,
        )) ?? []
      );
    } catch (err) {
      set({ error: apiErrorMessage(err, "Failed to load reactions") });
      throw err;
    }
  },

  removeByEntity: async (entityType, entityId) => {
    try {
      await api.delete(
        `/reactions/entity/${encodeURIComponent(entityType)}/${encodeURIComponent(entityId)}`,
      );
    } catch (err) {
      set({ error: apiErrorMessage(err, "Failed to remove reaction") });
      throw err;
    }
  },
}));
