import { useAppState } from '@/state/app-store';

export interface ApiError {
  msg: string;
  code?: string;
  detail?: string;
}

const API_PREFIX = '/api';
const API_VERSION_PREFIX = '/api/v1';

function normalizeApiPath(path: string): string {
  const normalizedPath = String(path || '').trim();

  if (!normalizedPath) {
    return API_PREFIX;
  }

  if (normalizedPath === API_VERSION_PREFIX) {
    return API_PREFIX;
  }

  if (normalizedPath.startsWith(`${API_VERSION_PREFIX}/`)) {
    return `${API_PREFIX}/${normalizedPath.slice(API_VERSION_PREFIX.length + 1)}`;
  }

  if (normalizedPath === API_PREFIX || normalizedPath.startsWith(`${API_PREFIX}/`)) {
    return normalizedPath;
  }

  if (normalizedPath.startsWith('/')) {
    return `${API_PREFIX}${normalizedPath}`;
  }

  return `${API_PREFIX}/${normalizedPath}`;
}

function shouldAttachProjectId(pathname: string): boolean {
  return pathname !== `${API_PREFIX}/health`;
}

export async function apiRequest(path: string, options?: RequestInit): Promise<any> {
  const { activeProject } = useAppState.getState();

  const requestPath = normalizeApiPath(path);
  const url = new URL(requestPath, window.location.origin);

  if (!url.searchParams.has('projectId') && shouldAttachProjectId(url.pathname)) {
    url.searchParams.set('projectId', activeProject);
  }

  const headers = new Headers(options?.headers);
  if (options?.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  let body = options?.body;
  const jsonBody = typeof body === 'string' ? body : null;
  const isJsonBody =
    jsonBody !== null &&
    headers.get('Content-Type')?.includes('application/json') &&
    shouldAttachProjectId(url.pathname);

  if (isJsonBody) {
    try {
      const parsedBody = JSON.parse(jsonBody);
      if (
        parsedBody &&
        typeof parsedBody === 'object' &&
        !Array.isArray(parsedBody) &&
        !('projectId' in parsedBody)
      ) {
        body = JSON.stringify({
          ...parsedBody,
          projectId: activeProject,
        });
      }
    } catch {
      // Leave non-JSON or already-serialized payloads untouched.
    }
  }

  const response = await fetch(url.toString(), {
    ...options,
    body,
    headers,
  });

  if (!response.ok) {
    const error: ApiError = await response.json().catch(() => ({
      msg: 'Request failed',
      code: 'unknown',
    }));
    throw new Error(error.msg || 'Request failed');
  }

  if (response.status === 204) {
    return null;
  }

  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    return response.json();
  }

  return response.text();
}
