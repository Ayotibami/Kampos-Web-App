"use client";

import { useEffect, useState } from "react";
import { SearchSelectList } from "@/components/setup/SearchSelectList";
import { useSetupProfileStore } from "@/stores/setupProfileStore";
import { useReferenceStore } from "@/stores/referenceStore";
import type { StepProps } from "../types";

export function SchoolStep({ onNext, setController }: StepProps) {
  const { data, update } = useSetupProfileStore();
  const { campuses, loadingCampuses, fetchCampuses } = useReferenceStore();

  // Seeded from the store, not null — so coming back here from a later step
  // shows the campus you already picked instead of starting over.
  const [selected, setSelected] = useState<string | null>(data.campus_tag || null);
  const [search, setSearch] = useState("");
  const [errored, setErrored] = useState(false);

  const load = async () => {
    try {
      await fetchCampuses();
      setErrored(false);
    } catch {
      setErrored(true);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onSelect = (id: string) => {
    setSelected(id);
    update({ campus_tag: id });
  };

  const handleContinue = () => {
    if (!selected) return;
    onNext();
  };

  useEffect(() => {
    setController({ continueDisabled: !selected, onContinue: handleContinue });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected]);

  return (
    <SearchSelectList
      layout="list"
      options={campuses.map((c) => ({ id: c.tag, label: c.label }))}
      selectedId={selected}
      onSelect={onSelect}
      search={search}
      onSearch={setSearch}
      placeholder="I go help you find am!"
      loading={loadingCampuses}
      errored={errored}
      onRetry={load}
      retryLabel="Fetch Campuses"
    />
  );
}
