/** The "Kampos" wordmark — accent-colored, Poppins. */
export function Wordmark({
  className = "",
  accentClassName = "text-brand-accent",
}: {
  className?: string;
  accentClassName?: string;
}) {
  return (
    <span className={`font-poppins font-extrabold tracking-tight ${className}`}>
      <span className={accentClassName}>Kampos</span>
    </span>
  );
}
