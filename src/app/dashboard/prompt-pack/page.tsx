import { redirect } from "next/navigation";
import { PROMPT_PACK_ROUTE } from "@/lib/context-pack/href";

export const dynamic = "force-dynamic";

export default function PromptPackPage({
  searchParams,
}: {
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(searchParams || {})) {
    if (Array.isArray(value)) {
      for (const item of value) {
        params.append(key, item);
      }
    } else if (typeof value === "string") {
      params.set(key, value);
    }
  }

  const nextHref = params.toString()
    ? `${PROMPT_PACK_ROUTE}?${params.toString()}`
    : PROMPT_PACK_ROUTE;

  redirect(nextHref);
}
