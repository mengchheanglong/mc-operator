import { useAppState } from '@/state/app-store';

export interface ApiError {
  msg: string;
  code?: string;
  detail?: string;
}

type ProjectScopeMode = 'auto' | 'none';

export interface ApiRequestOptions extends RequestInit {
  projectScope?: ProjectScopeMode;
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

export async function apiRequest<TResponse = any>(
  path: string,
  options?: ApiRequestOptions,
): Promise<TResponse> {
  const requestOptions = options;
  const projectScope = requestOptions?.projectScope ?? 'auto';
  const { activeProject } = useAppState.getState();

  const requestPath = normalizeApiPath(path);
  const url = new URL(requestPath, window.location.origin);

  if (
    projectScope !== 'none' &&
    !url.searchParams.has('projectId') &&
    shouldAttachProjectId(url.pathname)
  ) {
    url.searchParams.set('projectId', activeProject);
  }

  const headers = new Headers(requestOptions?.headers);
  if (requestOptions?.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  let body = requestOptions?.body;
  const jsonBody = typeof body === 'string' ? body : null;
  const isJsonBody =
    projectScope !== 'none' &&
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
    ...requestOptions,
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
    return null as TResponse;
  }

  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    return response.json() as Promise<TResponse>;
  }

  return response.text() as Promise<TResponse>;
}
