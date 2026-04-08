import { redirect } from "next/navigation";
import { PROMPT_PACK_ROUTE } from "@/lib/context-pack/href";

export const dynamic = "force-dynamic";

export default async function PromptPackPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const resolvedSearchParams = (await searchParams) ?? {};
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(resolvedSearchParams)) {
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
