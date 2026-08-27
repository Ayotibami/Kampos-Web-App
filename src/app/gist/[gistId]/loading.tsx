import { AppShell } from "@/components/layout/AppShell";
import { GistCardSkeleton } from "@/components/gist/GistCardSkeleton";

export default function Loading() {
  return (
    <AppShell variant="feed">
      <div className="flex h-dvh w-full flex-col items-center justify-center px-4">
        <div className="h-full w-full max-w-[620px] py-6 md:max-w-[740px]">
          <GistCardSkeleton />
        </div>
      </div>
    </AppShell>
  );
}
