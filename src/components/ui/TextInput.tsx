"use client";

import { forwardRef, useState, type InputHTMLAttributes, type ReactNode } from "react";
import { Eye, EyeOff } from "@/components/ui/icons";

interface TextInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "onChange"> {
  value: string;
  onChange: (value: string) => void;
  label?: string;
  /** Renders a show/hide toggle and manages the password visibility. */
  isPassword?: boolean;
  error?: boolean;
  /** Anything rendered in the same trailing slot as the password toggle —
   * e.g. a live-status icon (spinner/check/x) while the field is validated
   * against the backend as the user types. */
  trailingIcon?: ReactNode;
}

/**
 * PrimaryTextInput (web) — rounded field with a soft border, brand focus ring,
 * optional label and password visibility toggle. Fully responsive / touch-sized.
 */
export const TextInput = forwardRef<HTMLInputElement, TextInputProps>(function TextInput(
  { value, onChange, label, isPassword = false, error = false, trailingIcon, className = "", type, ...props },
  ref,
) {
  const [show, setShow] = useState(true);
  const resolvedType = isPassword ? (show ? "text" : "password") : type ?? "text";

  return (
    <label className="block w-full">
      {label && (
        <span className="mb-1.5 block font-nunito text-sm text-muted">{label}</span>
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
          className={`w-full bg-transparent py-3.5 font-nunito text-sm text-ink outline-none placeholder:text-faint ${className}`}
          {...props}
        />
        {isPassword && (
          <button
            type="button"
            onClick={() => setShow((s) => !s)}
            className="ml-2 flex shrink-0 items-center justify-center text-muted transition hover:text-brand"
            aria-label={show ? "Hide password" : "Show password"}
          >
            {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        )}
        {trailingIcon && <span className="ml-2 flex shrink-0 items-center justify-center">{trailingIcon}</span>}
      </div>
    </label>
  );
});
