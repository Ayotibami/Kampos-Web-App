/**
 * Placeholder "avatar" for an ACCOUNT (not a profile) — a plain blue circle
 * with the first letter of the account's email. Accounts don't have a
 * photo of their own (only profiles do, and an account can hold several,
 * so there's no single "the" photo to show once the Users list became
 * account-centric rather than one-row-per-profile). Used on both the Users
 * list and the account detail page — one consistent stand-in identity for
 * "this account", independent of whichever profile(s) it happens to hold.
 */
export function AccountInitialAvatar({ email, className = "" }: { email: string; className?: string }) {
  const letter = email.trim().charAt(0).toUpperCase() || "?";
  return (
    <div
      className={`flex items-center justify-center rounded-full bg-brand font-nunito font-bold text-white ${className}`}
      aria-hidden
    >
      {letter}
    </div>
  );
}
