import { NextResponse } from "next/server";
import { BACKEND_REQUIRED_FOR_WRITE_CODE } from "./backend-write-policy";

const DEFAULT_BACKEND_BASE_URL = "http://127.0.0.1:3201/api/v1";
const WRITE_METHODS = new Set(["POST", "PUT", "DELETE", "PATCH"]);

function resolveBaseUrl() {
  return (
    process.env.MISSION_CONTROL_BACKEND_BASE_URL?.trim() ||
    DEFAULT_BACKEND_BASE_URL
  );
}

function tryParseJson(input: string) {
  try {
    return JSON.parse(input);
  } catch {
    return null;
  }
}

export async function proxyDirectiveBackendRequest(input: {
  req: Request;
  path: string;
  projectId: string;
  includeSearchParams?: boolean;
  dropSearchParams?: string[];
  mapMissingCapabilityTo404?: boolean;
}) {
  return proxyBackendRequest(input);
}

export async function proxyBackendRequest(input: {
  req: Request;
  path: string;
  projectId: string;
  includeSearchParams?: boolean;
  dropSearchParams?: string[];
  mapMissingCapabilityTo404?: boolean;
}) {
  const {
    req,
    path,
    projectId,
    includeSearchParams = true,
    dropSearchParams = [],
    mapMissingCapabilityTo404 = false,
  } = input;
  const normalizedPath = path.replace(/^\/+/, "");
  const target = new URL(
    normalizedPath,
    `${resolveBaseUrl().replace(/\/+$/, "")}/`,
  );
  const requestUrl = new URL(req.url);

  if (includeSearchParams) {
    for (const [key, value] of requestUrl.searchParams.entries()) {
      if (!dropSearchParams.includes(key)) {
        target.searchParams.set(key, value);
      }
    }
  }
  target.searchParams.set("projectId", projectId);

  const headers = new Headers();
  const contentType = req.headers.get("content-type");
  if (contentType) headers.set("content-type", contentType);
  headers.set("accept", "application/json");
  const passthroughHeaders = [
    "x-openclaw-automation-token",
    "authorization",
    "cookie",
    "x-openclaw-project",
  ];
  for (const headerName of passthroughHeaders) {
    const value = req.headers.get(headerName);
    if (value) {
      headers.set(headerName, value);
    }
  }

  const method = req.method || "GET";
  const shouldReadBody = method !== "GET" && method !== "HEAD";
  const rawBody = shouldReadBody ? await req.text() : "";

  try {
    const response = await fetch(target.toString(), {
      method,
      headers,
      body: rawBody.length > 0 ? rawBody : undefined,
      cache: "no-store",
    });

    const responseText = await response.text();
    const parsed = tryParseJson(responseText);
    const parsedRecord =
      parsed && typeof parsed === "object"
        ? (parsed as Record<string, unknown>)
        : null;
    const parsedMessage =
      parsedRecord && typeof parsedRecord.message === "string"
        ? parsedRecord.message
        : null;

    if (
      mapMissingCapabilityTo404 &&
      response.status === 400 &&
      parsedMessage &&
      parsedMessage.includes("capability not found")
    ) {
      return NextResponse.json(
        { msg: "Directive capability not found." },
        { status: 404 },
      );
    }

    if (parsed !== null) {
      return NextResponse.json(parsed, { status: response.status });
    }

    return new NextResponse(responseText, {
      status: response.status,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  } catch (error) {
    console.error("Directive backend proxy error:", error);
    const isWrite = WRITE_METHODS.has(method);
    return NextResponse.json(
      {
        msg: isWrite
          ? "This write operation requires the backend to be running."
          : "Directive backend is unavailable.",
        ...(isWrite ? { code: BACKEND_REQUIRED_FOR_WRITE_CODE } : {}),
        detail:
          "Start backend with `npm run backend:dev` or set MISSION_CONTROL_BACKEND_BASE_URL.",
      },
      { status: 502 },
    );
  }
}
