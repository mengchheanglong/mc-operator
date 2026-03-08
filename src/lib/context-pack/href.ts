import type { ContextFocusType } from "@/types/context-pack";

export const PROMPT_PACK_ROUTE = "/dashboard/prompt-pack";

export function buildPromptPackHref(
  focusType: ContextFocusType,
  focusId?: string | null,
) {
  const params = new URLSearchParams();
  params.set("focusType", focusType);

  if (focusId) {
    params.set("focusId", focusId);
  }

  const query = params.toString();
  return query ? `${PROMPT_PACK_ROUTE}?${query}` : PROMPT_PACK_ROUTE;
}
