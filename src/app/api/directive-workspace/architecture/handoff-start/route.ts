import { badRequest, serverError } from "@/server/http/api-response";
import { startDirectiveArchitectureFromHandoff } from "@/server/services/directive-architecture-handoff-start-service";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => null)) as
      | { handoffPath?: unknown; startedBy?: unknown }
      | null;

    const result = startDirectiveArchitectureFromHandoff({
      handoffPath: String(body?.handoffPath || ""),
      startedBy: typeof body?.startedBy === "string" ? body.startedBy : null,
    });

    return Response.json({
      ok: true,
      start: result,
    });
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("invalid_input:")) {
      return badRequest(error.message);
    }
    return serverError(
      error,
      "Directive Architecture handoff start error",
      "Failed to open a bounded Architecture start from the handoff stub.",
    );
  }
}
