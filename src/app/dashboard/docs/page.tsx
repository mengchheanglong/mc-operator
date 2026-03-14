import { Suspense } from "react";
import { Loader2 } from "lucide-react";
import DocsPageClient from "./DocsPageClient";

export const dynamic = "force-dynamic";

export default function DocsPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-full items-center justify-center text-white">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      }
    >
      <DocsPageClient />
    </Suspense>
  );
}
