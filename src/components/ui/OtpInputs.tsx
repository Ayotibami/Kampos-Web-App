"use client";

import { useRef, type ClipboardEvent, type KeyboardEvent } from "react";

interface OtpInputsProps {
  value: string[];
  onChange: (next: string[]) => void;
  length?: number;
  error?: boolean;
}

/**
 * Six-box OTP entry with auto-advance, backspace-to-previous, and paste support.
 * Ported from the mobile OtpInputs; digit-only.
 */
export function OtpInputs({ value, onChange, length = 6, error = false }: OtpInputsProps) {
  const refs = useRef<(HTMLInputElement | null)[]>([]);

  const setDigit = (index: number, digit: string) => {
    const next = [...value];
    next[index] = digit;
    onChange(next);
  };

  const handleChange = (index: number, raw: string) => {
    const digit = raw.replace(/\D/g, "").slice(-1);
    setDigit(index, digit);
    if (digit && index < length - 1) refs.current[index + 1]?.focus();
  };

  const handleKeyDown = (index: number, e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace" && !value[index] && index > 0) {
      refs.current[index - 1]?.focus();
      setDigit(index - 1, "");
    }
  };

  const handlePaste = (e: ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const digits = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, length).split("");
    if (!digits.length) return;
    const next = Array.from({ length }, (_, i) => digits[i] ?? "");
    onChange(next);
    refs.current[Math.min(digits.length, length - 1)]?.focus();
  };

  return (
    <div className="flex justify-center gap-2 sm:gap-3">
      {Array.from({ length }).map((_, i) => (
        <input
          key={i}
          ref={(el) => {
            refs.current[i] = el;
          }}
          inputMode="numeric"
          maxLength={1}
          value={value[i] ?? ""}
          onChange={(e) => handleChange(i, e.target.value)}
          onKeyDown={(e) => handleKeyDown(i, e)}
          onPaste={handlePaste}
          className={`h-12 w-11 rounded-xl border bg-white text-center font-poppins text-lg font-semibold text-ink outline-none transition focus:ring-2 focus:ring-brand/40 sm:h-14 sm:w-12 ${
            error ? "border-danger" : "border-line focus:border-brand"
          }`}
        />
      ))}
    </div>
  );
}
