import { errorResponse } from "@/server/http/api-response";

export const AUTOMATION_TOKEN_HEADER = "x-openclaw-automation-token";

function getConfiguredAutomationToken() {
  return process.env.OPENCLAW_AUTOMATION_TOKEN?.trim() || "";
}

export function requireAutomationToken(req: Request) {
  const expectedToken = getConfiguredAutomationToken();
  if (!expectedToken) {
    return errorResponse(
      "OPENCLAW_AUTOMATION_TOKEN is not configured.",
      503,
    );
  }

  const providedToken = req.headers.get(AUTOMATION_TOKEN_HEADER)?.trim() || "";

  if (!providedToken || providedToken !== expectedToken) {
    return errorResponse("Invalid automation token.", 401);
  }

  return null;
}
