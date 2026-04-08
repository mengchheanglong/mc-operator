import { NextResponse } from "next/server";

export const BACKEND_REQUIRED_FOR_WRITE_CODE = "backend_required_for_write";

export function backendRequiredForWriteResponse(
  resourceLabel: string,
  detail?: string,
) {
  return NextResponse.json(
    {
      msg: `${resourceLabel} writes require the backend to be running.`,
      code: BACKEND_REQUIRED_FOR_WRITE_CODE,
      detail:
        detail ||
        "Start the backend with `npm run backend:dev` or `npm run backend:start`, then retry the write.",
    },
    { status: 502 },
  );
}
