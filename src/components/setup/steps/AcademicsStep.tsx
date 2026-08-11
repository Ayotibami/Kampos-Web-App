"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { SearchSelectList } from "@/components/setup/SearchSelectList";
import { Chip } from "@/components/ui/Chip";
import { useSetupProfileStore } from "@/stores/setupProfileStore";
import { useReferenceStore } from "@/stores/referenceStore";
import type { StepProps } from "../types";

const LEVELS = ["100", "200", "300", "400", "500", "600"];

export function AcademicsStep({ onNext, setController }: StepProps) {
  const { data, update } = useSetupProfileStore();
  const { majors, loadingMajors, fetchMajors } = useReferenceStore();

  // Seeded from the store so coming back here from the profile/avitag steps
  // shows what was already picked instead of starting over.
  const [major, setMajor] = useState<string | null>(data.major_tag || null);
  const [level, setLevel] = useState<string | null>(data.level || null);
  const [search, setSearch] = useState("");
  const [errored, setErrored] = useState(false);

  const load = async () => {
    try {
      await fetchMajors();
      setErrored(false);
    } catch {
      setErrored(true);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onSelectMajor = (id: string) => {
    setMajor(id);
    update({ major_tag: id });
  };
  const onSelectLevel = (lvl: string) => {
    setLevel(lvl);
    update({ level: lvl });
  };

  const handleContinue = () => {
    if (!major || !level) return;
    onNext();
  };

  useEffect(() => {
    setController({ continueDisabled: !major || !level, onContinue: handleContinue });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [major, level]);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-5">
      <div className="flex min-h-0 flex-1 flex-col gap-2">
        <span className="font-nunito text-sm text-muted">Major</span>
        <SearchSelectList
          layout="chips"
          options={majors.map((m) => ({ id: m.major_tag, label: m.major_name }))}
          selectedId={major}
          onSelect={onSelectMajor}
          search={search}
          onSearch={setSearch}
          placeholder="You no see am?"
          loading={loadingMajors}
          errored={errored}
          onRetry={load}
          retryLabel="Fetch Majors"
        />
      </div>

      {/* Only appears once a Major's actually picked — the harder,
          50-option decision gets the whole card to itself first, instead
          of both sections permanently splitting the space whether or not
          Level is even relevant yet. */}
      <AnimatePresence>
        {major && (
          <motion.div
            className="shrink-0 space-y-2"
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 24 }}
            transition={{ type: "spring", stiffness: 340, damping: 30 }}
          >
            <span className="font-nunito text-sm text-muted">Level</span>
            <div className="flex flex-wrap gap-2">
              {LEVELS.map((lvl) => (
                <Chip key={lvl} selected={level === lvl} onClick={() => onSelectLevel(lvl)}>
                  {lvl}
                </Chip>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
