"use client";

import { useEffect, useRef, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Illustration } from "@/components/brand/illustrations";
import { X, Search, Check, Sticker } from "@/components/ui/icons";
import { fetchTrending, searchTenor, type TenorItem } from "@/lib/tenor";
import { env } from "@/lib/env";

type Kind = "gifs" | "stickers";

const SEARCH_DEBOUNCE_MS = 400;

/**
 * GIF/sticker picker, powered by Tenor — a real dialog (not a tiny
 * dropdown), matching the weight ReportModal already established for
 * anything with search + a grid of results. Multi-select up to
 * `maxSelectable` (the room left under the gist's media cap), Kampos brand
 * styling throughout (rounded pills, brand blue selection, Poppins).
 */
export function TenorPicker({
  open,
  onClose,
  onAttach,
  maxSelectable,
}: {
  open: boolean;
  onClose: () => void;
  /** Fires with the picked items' full-size URLs once "Attach" is pressed. */
  onAttach: (urls: string[]) => void;
  /** How many more media slots are left on the gist — caps selection. */
  maxSelectable: number;
}) {
  const [kind, setKind] = useState<Kind>("gifs");
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<TenorItem[]>([]);
  const [selected, setSelected] = useState<TenorItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [errored, setErrored] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const configured = !!env.TENOR_API_KEY;

  const load = async (nextKind: Kind, nextQuery: string) => {
    if (!configured) return;
    setLoading(true);
    setErrored(false);
    try {
      const results = nextQuery.trim()
        ? await searchTenor(nextKind, nextQuery.trim())
        : await fetchTrending(nextKind);
      setItems(results);
    } catch {
      setErrored(true);
    } finally {
      setLoading(false);
    }
  };

  // Reset to a clean slate each time the picker opens, and load trending
  // right away so there's something to see before typing anything.
  useEffect(() => {
    if (!open) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setQuery("");
    setKind("gifs");
    setSelected([]);
    void load("gifs", "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) return;
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => void load(kind, query), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(debounceRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, query, open]);

  const toggle = (item: TenorItem) => {
    setSelected((cur) => {
      const already = cur.some((s) => s.id === item.id);
      if (already) return cur.filter((s) => s.id !== item.id);
      if (cur.length >= maxSelectable) return cur;
      return [...cur, item];
    });
  };

  const handleAttach = () => {
    if (!selected.length) return;
    onAttach(selected.map((s) => s.fullUrl));
    onClose();
  };

  return (
    <Modal open={open} onClose={onClose} className="h-[75vh] w-[60vw] max-md:h-[90vh] max-md:w-[92vw]">
      <div className="flex h-full flex-col rounded-3xl bg-surface-2 p-8 shadow-2xl">
        {/* Header */}
        <div className="flex shrink-0 items-center gap-3 pr-12">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand/10 text-brand">
            <Sticker className="h-5 w-5" />
          </div>
          <h2 className="font-poppins text-xl font-bold text-ink">GIFs &amp; Stickers</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="ml-auto flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted transition hover:bg-black/5"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {!configured ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
            <Illustration name="Kappywithwire" className="h-40 w-auto" />
            <p className="font-poppins text-sm italic text-muted">
              GIFs and stickers aren&apos;t set up yet — check back soon!
            </p>
          </div>
        ) : (
          <>
            {/* Tabs */}
            <div className="mt-5 flex shrink-0 gap-2">
              {(["gifs", "stickers"] as Kind[]).map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setKind(k)}
                  className={`rounded-full border px-5 py-2 font-poppins text-sm font-medium capitalize transition ${
                    kind === k
                      ? "border-brand bg-brand text-white"
                      : "border-brand/60 bg-[#F3F6F9] text-brand hover:bg-brand/5"
                  }`}
                >
                  {k}
                </button>
              ))}
            </div>

            {/* Search */}
            <div className="mt-4 flex shrink-0 items-center rounded-xl bg-white px-3 shadow-[0_8px_24px_-12px_rgba(9,30,66,0.35)] ring-1 ring-line">
              <Search className="h-4 w-4 shrink-0 text-faint" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={`Search ${kind}...`}
                maxLength={50}
                className="w-full bg-transparent py-3 pl-2 font-poppins text-sm text-ink outline-none placeholder:text-faint"
              />
            </div>

            {/* Grid */}
            <div className="mt-4 min-h-0 flex-1 overflow-y-auto no-scrollbar">
              {errored ? (
                <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
                  <Illustration name="Kappywithwire" className="h-32 w-auto" />
                  <p className="font-poppins text-xs italic text-muted">
                    Wire don cut o — I no fit fetch am. Abeg check your internet.
                  </p>
                </div>
              ) : loading ? (
                <div className="columns-2 gap-2 sm:columns-3">
                  {Array.from({ length: 12 }).map((_, i) => (
                    <div key={i} className="mb-2 h-28 w-full animate-pulse rounded-xl bg-line/60" />
                  ))}
                </div>
              ) : items.length === 0 ? (
                <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
                  <Illustration name="Kappymagnifyingglass" className="h-32 w-auto" />
                  <p className="font-poppins text-xs italic text-muted">
                    Omo, I no see wetin you dey find o!
                  </p>
                </div>
              ) : (
                <div className="columns-2 gap-2 sm:columns-3">
                  {items.map((item) => {
                    const isSelected = selected.some((s) => s.id === item.id);
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => toggle(item)}
                        className="relative mb-2 block w-full overflow-hidden rounded-xl transition active:scale-95"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={item.previewUrl}
                          alt={item.description}
                          loading="lazy"
                          className={`w-full rounded-xl transition ${isSelected ? "ring-4 ring-brand" : ""}`}
                        />
                        {isSelected && (
                          <span className="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-brand shadow">
                            <Check className="h-3.5 w-3.5 text-white" />
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="mt-5 flex shrink-0 items-center justify-between gap-4">
              <span className="font-poppins text-[11px] text-faint">Powered by Tenor</span>
              <Button
                onClick={handleAttach}
                disabled={!selected.length}
                fullWidth={false}
                className="!px-7 !py-2.5"
              >
                Attach{selected.length ? ` (${selected.length})` : ""}
              </Button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
