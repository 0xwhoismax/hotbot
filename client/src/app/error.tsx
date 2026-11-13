"use client";
import { LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useChunkReload } from "@/lib/chunkReload";

export default function Error({ error }: { error: Error & { digest?: string }; reset: () => void }) {
  const reloading = useChunkReload(error);
  return (
    <div className="min-h-[50vh] w-full flex items-center justify-center">
      {reloading ? <div role="status" aria-label="Loading"><LoaderCircle aria-hidden className="size-5 text-muted-foreground motion-safe:animate-spin"/></div> : (
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="text-lg font-semibold">Something went wrong</div>
          <div className="text-sm text-muted-foreground">Try again to recover the session.</div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => window.location.reload()}>Reload</Button>
          </div>
        </div>
      )}
    </div>
  );
}
