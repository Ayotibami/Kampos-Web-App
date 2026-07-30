"use client";

import { forwardRef, useState, type InputHTMLAttributes } from "react";

interface TextInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "onChange"> {
  value: string;
  onChange: (value: string) => void;
  label?: string;
  /** Renders a show/hide toggle and manages the password visibility. */
  isPassword?: boolean;
  error?: boolean;
}

/**
 * PrimaryTextInput (web) — rounded field with a soft border, brand focus ring,
 * optional label and password visibility toggle. Fully responsive / touch-sized.
 */
export const TextInput = forwardRef<HTMLInputElement, TextInputProps>(function TextInput(
  { value, onChange, label, isPassword = false, error = false, className = "", type, ...props },
  ref,
) {
  const [show, setShow] = useState(false);
  const resolvedType = isPassword ? (show ? "text" : "password") : type ?? "text";

  return (
    <label className="block w-full">
      {label && (
        <span className="mb-1.5 block font-poppins text-sm text-muted">{label}</span>
      )}
      <div
        className={`flex items-center rounded-2xl border bg-white px-4 transition focus-within:ring-2 focus-within:ring-brand/40 ${
          error ? "border-danger" : "border-line focus-within:border-brand"
        }`}
      >
        <input
          ref={ref}
          type={resolvedType}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={`w-full bg-transparent py-3.5 font-poppins text-sm text-ink outline-none placeholder:text-faint ${className}`}
          {...props}
        />
        {isPassword && (
          <button
            type="button"
            onClick={() => setShow((s) => !s)}
            className="ml-2 shrink-0 font-poppins text-xs font-semibold text-brand"
            aria-label={show ? "Hide password" : "Show password"}
          >
            {show ? "Hide" : "Show"}
          </button>
        )}
      </div>
    </label>
  );
});
