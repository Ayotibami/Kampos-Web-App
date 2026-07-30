"use client";

interface LinkTextProps {
  normalText: string;
  linkText: string;
  onClick?: () => void;
  disabled?: boolean;
}

/** "Account already exists? Log in." — the mobile LinkText pattern. */
export function LinkText({ normalText, linkText, onClick, disabled }: LinkTextProps) {
  return (
    <p className="text-center font-poppins text-sm text-muted">
      {normalText}{" "}
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        className="font-semibold text-brand underline-offset-2 hover:underline disabled:opacity-50"
      >
        {linkText}
      </button>
    </p>
  );
}
