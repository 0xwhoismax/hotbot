"use client";

import React from "react";
import { Button } from "@/components/ui/button";

export default function Error({  }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="min-h-[50vh] w-full flex items-center justify-center">
      <div className="flex flex-col items-center gap-3 text-center">
        <div className="text-lg font-semibold">Something went wrong</div>
        <div className="text-sm text-muted-foreground">Try again to recover the session.</div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => window.location.reload()}>Reload</Button>
        </div>
      </div>
    </div>
  );
}


