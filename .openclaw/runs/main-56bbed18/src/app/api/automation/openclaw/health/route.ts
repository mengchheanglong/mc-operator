import { NextResponse } from "next/server";
import { serverError } from "@/server/http/api-response";
import { probeOpenClawAgent } from "@/server/services/openclaw-delivery-service";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const result = await probeOpenClawAgent({ timeoutSeconds: 12 });
    return NextResponse.json(result, { status: result.ok ? 200 : 503 });
  } catch (error) {
    return serverError(error, "OpenClaw health check error", "Failed to check OpenClaw availability.");
  }
}
