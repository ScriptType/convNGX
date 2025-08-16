/**
 * Shared types for Convex Angular core.
 * Pure extraction for readability; no behavior changes.
 */

/** Auth token fetcher used by ConvexAngularClient.setAuth */
export type FetchAccessToken = (o: { forceRefreshToken: boolean }) => Promise<string | null>;

/** Snapshot of current auth state (token presence-based) */
export type AuthSnapshot = {
  isAuthenticated: boolean;
  token: string | null;
  exp?: number;
};