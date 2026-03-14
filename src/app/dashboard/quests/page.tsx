import { Suspense } from "react";
import { Loader2 } from "lucide-react";
import QuestsPageClient from "./QuestsPageClient";

export const dynamic = "force-dynamic";

export default function QuestLogPage() {
  return (
    <Suspense
      fallback={
        <div className="matte-page mx-auto w-full max-w-5xl animate-fade-in pb-10 text-text-primary">
          <div className="matte-panel flex items-center justify-center py-10 text-text-secondary">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span className="ml-2 text-sm">Loading quests...</span>
          </div>
        </div>
      }
    >
      <QuestsPageClient />
    </Suspense>
  );
}
