/**
 * Copy this file to `environment.ts` and fill in your values.
 * Do NOT commit `environment.ts` (it's gitignored).
 */
export const environment = {
  convexUrl: 'https://YOUR.convex.cloud',
  authBaseURL: 'https://YOUR.convex.site',
  authSkewMs: 45000 as number, // optional skew before JWT expiry to refresh
  keep: 'last' as 'last' | 'none', // default keep mode for live resources
};