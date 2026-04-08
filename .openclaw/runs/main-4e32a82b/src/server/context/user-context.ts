import { findOrCreateUser } from '@/server/repositories/users-repo';

export interface UserContext {
  id: string;
}

/**
 * Resolve the active user for single-user mode (auth removed).
 * Uses the most recently updated user if available, otherwise creates one.
 */
export async function resolveUserContext(): Promise<UserContext> {
  const user = findOrCreateUser();

  return {
    id: user.id,
  };
}
