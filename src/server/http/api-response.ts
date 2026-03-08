import { NextResponse } from 'next/server';

/**
 * Returns a JSON error response with a standardized format.
 * @param msg Error message
 * @param status HTTP status code (default: 400)
 */
export function errorResponse(msg: string, status: number = 400) {
  return NextResponse.json({ msg }, { status });
}

/**
 * Returns a 400 Bad Request response.
 * @param msg Error message
 */
export function badRequest(msg: string) {
  return errorResponse(msg, 400);
}

/**
 * Returns a 404 Not Found response.
 * @param msg Error message (default: 'Not found.')
 */
export function notFound(msg: string = 'Not found.') {
  return errorResponse(msg, 404);
}

/**
 * Logs the error and returns a 500 Server Error response.
 * @param error The error object
 * @param context Log context message (default: 'Server error')
 * @param userMsg User-facing message (default: 'Server error.')
 */
export function serverError(error: unknown, context: string = 'Server error', userMsg: string = 'Server error.') {
  console.error(`${context}:`, error);
  return errorResponse(userMsg, 500);
}
