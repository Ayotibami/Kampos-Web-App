import { Illustration } from "@/components/brand/illustrations";
import { Heart } from "@/components/ui/icons";

/**
 * A miniature version of the real feed comment bubble (CommentPanel) — same
 * chat-bubble-tail shape, same avatar treatment, same heart-reaction row —
 * not an invented marketing mockup.
 */
export function MiniCommentCard({
  name,
  avitag,
  time,
  text,
  reactions,
  reacted = false,
  className = "",
}: {
  name: string;
  avitag: string;
  time: string;
  text: string;
  reactions: number;
  reacted?: boolean;
  className?: string;
}) {
  return (
    <div className={`relative ml-3 w-full ${className}`}>
      <svg
        className="absolute -left-3 top-0 h-4 w-3 text-surface-2"
        viewBox="0 0 12 16"
        fill="currentColor"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path d="M12 0H0L12 16V0Z" />
      </svg>
      <div className="rounded-2xl rounded-tl-none bg-surface-2 p-3 shadow-xl ring-1 ring-black/5">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-brand-light">
            <Illustration name="Kamill" className="h-full w-full object-cover" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate font-poppins text-[12px] font-semibold leading-tight text-ink">{name}</p>
            <p className="truncate font-poppins text-[9px] leading-tight text-muted">
              @{avitag} · {time}
            </p>
          </div>
        </div>
        <p className="mt-1.5 font-poppins text-[12px] leading-snug text-ink">{text}</p>
        <div className="mt-1.5 flex items-center gap-1">
          <Heart className={`h-3 w-3 ${reacted ? "fill-danger text-danger" : "text-muted"}`} />
          <span className="font-poppins text-[10px] text-muted">{reactions}</span>
        </div>
      </div>
    </div>
  );
}
