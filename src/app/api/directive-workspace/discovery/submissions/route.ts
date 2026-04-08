import { badRequest, serverError } from "@/server/http/api-response";
import { submitDiscoveryEntry } from "@/server/services/directive-discovery-submission-service";
import type { DiscoverySubmissionRequest } from "@/lib/directive-workspace/discovery-submission-router";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const url = new URL(req.url);
    const dryRun =
      url.searchParams.get("dry_run") === "1" ||
      url.searchParams.get("mode") === "dry_run";
    const processWithEngine = url.searchParams.get("process_with_engine") === "1";
    const body = (await req.json()) as DiscoverySubmissionRequest;
    const result = await submitDiscoveryEntry({
      request: body,
      dryRun,
      processWithEngine,
    });
    return Response.json(result, { status: 200 });
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("invalid_input:")) {
      return badRequest(error.message);
    }
    if (error instanceof Error) {
      return badRequest(error.message);
    }
    return serverError(
      error,
      "Directive discovery submission error",
      "Failed to submit directive discovery entry.",
    );
  }
}
