"use client";

import { useEffect, useRef } from "react";
import { Search, X, Check } from "@/components/ui/icons";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { Illustration } from "@/components/brand/illustrations";

export interface Option {
  id: string;
  label: string;
}

interface SearchSelectListProps {
  options: Option[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  search: string;
  onSearch: (value: string) => void;
  placeholder: string;
  loading: boolean;
  errored: boolean;
  onRetry: () => void;
  retryLabel: string;
  layout?: "list" | "chips";
}

/**
 * Searchable selector with the mobile app's four states: loading skeletons,
 * network-error (Kappy + retry), empty-search (Kappy magnifier), and results.
 * `layout="list"` for campuses, `layout="chips"` for majors.
 */
export function SearchSelectList({
  options,
  selectedId,
  onSelect,
  search,
  onSearch,
  placeholder,
  loading,
  errored,
  onRetry,
  retryLabel,
  layout = "list",
}: SearchSelectListProps) {
  const filtered = search
    ? options.filter((o) => o.label.toLowerCase().includes(search.toLowerCase()))
    : options;
  // `loading` now just means "refreshing in the background" — options are
  // pre-seeded with default data (see referenceStore), so only fall back to
  // the skeleton if there's genuinely nothing to show yet.
  const showSkeleton = loading && options.length === 0;
  const emptySearch = !showSkeleton && !errored && search !== "" && filtered.length === 0;

  // Coming back to a long list (schools, majors) with something already
  // picked shouldn't mean hunting for it again — scroll it into view once
  // the real results render, rather than reordering the list itself (which
  // would make it look different every time depending on what's selected).
  // Once only, guarded so retrying after an error or typing a search later
  // doesn't keep yanking the scroll position back.
  const selectedElRef = useRef<HTMLElement | null>(null);
  const hasAutoScrolled = useRef(false);
  useEffect(() => {
    if (hasAutoScrolled.current || showSkeleton || errored || !selectedId) return;
    if (!selectedElRef.current) return;
    hasAutoScrolled.current = true;
    selectedElRef.current.scrollIntoView({ block: "center" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showSkeleton, errored]);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      {/* Search bar */}
      <div className="flex shrink-0 items-center rounded-xl bg-white px-3 shadow-[0_8px_24px_-12px_rgba(9,30,66,0.35)] ring-1 ring-line">
        <input
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          placeholder={placeholder}
          maxLength={24}
          className="w-full bg-transparent py-3 font-poppins text-sm text-ink outline-none placeholder:text-faint"
        />
        {search ? (
          <button type="button" onClick={() => onSearch("")} aria-label="Clear">
            <X className="h-5 w-5 text-faint" />
          </button>
        ) : (
          <Search className="h-5 w-5 text-faint" />
        )}
      </div>

      {/* Results area */}
      <div className="min-h-0 flex-1 overflow-y-auto no-scrollbar">
        {errored ? (
          <div className="flex h-full flex-col items-center justify-center gap-4 py-6 text-center">
            <Illustration name="Kappywithwire" className="h-40 w-auto" />
            <p className="font-poppins text-xs italic text-muted">
              Wire don cut o — I no fit fetch the data. Abeg check your internet.
            </p>
            <div className="w-40">
              <Button onClick={onRetry} loading={loading}>
                {retryLabel}
              </Button>
            </div>
          </div>
        ) : emptySearch ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 py-6 text-center">
            <Illustration name="Kappymagnifyingglass" className="h-40 w-auto" />
            <p className="font-poppins text-xs italic text-muted">
              Omo, I no see wetin you dey find o!
            </p>
          </div>
        ) : showSkeleton ? (
          <SkeletonRows layout={layout} />
        ) : layout === "chips" ? (
          <div className="flex flex-wrap gap-2 pb-6">
            {filtered.map((o) => (
              <div
                key={o.id}
                ref={
                  o.id === selectedId
                    ? (el) => {
                        selectedElRef.current = el;
                      }
                    : undefined
                }
              >
                <Chip selected={selectedId === o.id} onClick={() => onSelect(o.id)}>
                  {o.label}
                </Chip>
              </div>
            ))}
          </div>
        ) : (
          <ul className="pb-6">
            {filtered.map((o) => {
              const isSelected = selectedId === o.id;
              return (
                <li
                  key={o.id}
                  ref={
                    isSelected
                      ? (el) => {
                          selectedElRef.current = el;
                        }
                      : undefined
                  }
                >
                  <button
                    type="button"
                    onClick={() => onSelect(o.id)}
                    className={`flex w-full items-center gap-3 rounded-xl border-b px-3 py-2.5 text-left transition-colors ${
                      isSelected
                        ? "border-transparent bg-brand/10"
                        : "border-line hover:bg-brand/5"
                    }`}
                  >
                    <span
                      className={`flex-1 font-poppins text-sm transition-colors ${
                        isSelected ? "font-semibold text-brand" : "text-ink"
                      }`}
                    >
                      {o.label}
                    </span>
                    {isSelected && (
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand">
                        <Check className="h-3.5 w-3.5 text-white" />
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

function SkeletonRows({ layout }: { layout: "list" | "chips" }) {
  const count = layout === "chips" ? 10 : 8;
  if (layout === "chips") {
    return (
      <div className="flex flex-wrap gap-2">
        {Array.from({ length: count }).map((_, i) => (
          <div key={i} className="h-9 w-24 animate-pulse rounded-full bg-line/60" />
        ))}
      </div>
    );
  }
  return (
    <div className="space-y-3">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="h-6 w-full animate-pulse rounded bg-line/60" />
      ))}
    </div>
  );
}
