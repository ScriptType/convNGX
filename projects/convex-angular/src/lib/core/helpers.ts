/**
 * Internal helpers for ConvexAngularClient.
 * NOTE: Pure refactor; functionality unchanged.
 */

export const AUTH_KEY = 'convex:jwt';
export const AUTH_CH = 'convex-auth';

/** Decode JWT exp claim (ms). Returns 0 if invalid. */
export function jwtExpMs(jwt: string): number {
  try {
    const payload = JSON.parse(atob(jwt.split('.')[1] || ''));
    return typeof payload?.exp === 'number' ? payload.exp * 1000 : 0;
  } catch {
    return 0;
  }
}

/** Canonical JSON stringify for stable de-dupe keys. */
export function stableStringify(input: unknown): string {
  const seen = new WeakSet<object>();
  const norm = (v: any): any => {
    if (v === null || typeof v !== 'object') return v;
    if (seen.has(v)) return v;
    seen.add(v);
    if (Array.isArray(v)) return v.map(norm);
    return Object.keys(v)
      .sort()
      .reduce((acc: any, k) => {
        acc[k] = norm(v[k]);
        return acc;
      }, {});
  };
  return JSON.stringify(norm(input));
}

/** sessionStorage helpers (some browsers may throw on access) */
export const safeSession = {
  get: (k: string): string | null => {
    try {
      return typeof sessionStorage !== 'undefined' ? sessionStorage.getItem(k) : null;
    } catch {
      return null;
    }
  },
  set: (k: string, v: string) => {
    try {
      if (typeof sessionStorage !== 'undefined') sessionStorage.setItem(k, v);
    } catch {
      /* no-op */
    }
  },
  del: (k: string) => {
    try {
      if (typeof sessionStorage !== 'undefined') sessionStorage.removeItem(k);
    } catch {
      /* no-op */
    }
  },
};