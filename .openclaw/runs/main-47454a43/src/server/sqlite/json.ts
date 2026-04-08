// ---------------------------------------------------------------------------
// Shared JSON field serialization helpers
// Used by repositories only — do not spread JSON.parse/stringify in routes.
// ---------------------------------------------------------------------------

/**
 * Safely serialize a value to a JSON string for storage in a text column.
 * Falls back to `"{}"` for nullish input.
 */
export function stringifyJsonField(value: unknown): string {
  return JSON.stringify(value ?? {});
}

/**
 * Parse a JSON text column back into a typed object.
 * Returns an empty object (cast to `T`) on null/invalid input.
 */
export function parseJsonField<T = Record<string, unknown>>(
  raw: string | null | undefined,
): T {
  if (!raw) return {} as T;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return {} as T;
  }
}
