import { NextResponse } from 'next/server';

const BACKEND_URL = process.env.MISSION_CONTROL_BACKEND_URL || 'http://127.0.0.1:3201';

function normalizeBackendPath(path: string[]) {
  const normalizedSegments = path[0] === 'v1' ? path.slice(1) : path;
  return `/api/v1/${normalizedSegments.join('/')}`;
}

export async function proxyBackendRequest(request: Request, path: string[]) {
  const url = new URL(request.url);
  const backendPath = normalizeBackendPath(path);
  const backendUrl = `${BACKEND_URL}${backendPath}${url.search}`;

  try {
    const body = ['GET', 'HEAD'].includes(request.method)
      ? undefined
      : await request.text();

    const forwardHeaders: Record<string, string> = {
      Accept: request.headers.get('accept') || 'application/json',
    };

    const contentType = request.headers.get('content-type');
    if (contentType && body !== undefined) {
      forwardHeaders['Content-Type'] = contentType;
    }

    const authHeader = request.headers.get('authorization');
    if (authHeader) {
      forwardHeaders.Authorization = authHeader;
    }

    const cookie = request.headers.get('cookie');
    if (cookie) {
      forwardHeaders.Cookie = cookie;
    }

    const response = await fetch(backendUrl, {
      method: request.method,
      headers: forwardHeaders,
      body,
      signal: AbortSignal.timeout(10000),
    });

    const data = await response.text();

    return new NextResponse(data, {
      status: response.status,
      headers: {
        'Content-Type': response.headers.get('Content-Type') || 'application/json',
        'Cache-Control': 'no-cache',
      },
    });
  } catch {
    const isWrite = !['GET', 'HEAD'].includes(request.method);

    if (isWrite) {
      return NextResponse.json(
        {
          msg: 'This write operation requires the backend to be running.',
          code: 'backend_required_for_write',
          detail: 'Start backend with `npm run backend:dev` or `npm run dev:stack`.',
        },
        { status: 502 },
      );
    }

    return NextResponse.json(
      {
        msg: 'This read operation requires the backend to be running.',
        code: 'backend_unreachable',
        detail: 'Start backend with `npm run backend:dev` or `npm run dev:stack`.',
      },
      { status: 503 },
    );
  }
}
