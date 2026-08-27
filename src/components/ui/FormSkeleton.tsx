/**
 * Generic loading placeholder for the simple single-form screens (login,
 * signup, verify-otp, forgot/reset-password, signup-success, setup-profile)
 * — a heading bar, a couple of field-shaped bars, and a button bar. Doesn't
 * try to mirror each form's exact fields (unlike GistCardSkeleton/
 * ProfileGistCardSkeleton/ProfileSettingsSkeleton, which are worth matching
 * precisely since those screens are visited constantly) — these are
 * one-shot flows, so "a form is loading" reads clearly enough without a
 * bespoke skeleton per screen.
 */
export function FormSkeleton() {
  return (
    <div className="flex w-full flex-col gap-4 animate-pulse">
      <div className="mx-auto h-4 w-40 rounded-full bg-line/40" />
      <div className="h-12 w-full rounded-2xl bg-line/40" />
      <div className="h-12 w-full rounded-2xl bg-line/40" />
      <div className="mt-2 h-12 w-full rounded-full bg-line/50" />
    </div>
  );
}
