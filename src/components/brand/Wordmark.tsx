/** The "Kampos" wordmark — accent-colored, Nunito. */
export function Wordmark({
  className = "",
  accentClassName = "text-brand-accent",
}: {
  className?: string;
  accentClassName?: string;
}) {
  return (
    <span className={`font-nunito font-extrabold tracking-tight ${className}`}>
      <span className={accentClassName}>Kampos</span>
    </span>
  );
}
