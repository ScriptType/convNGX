/**
 * ConvexAngularClient
 * - Wraps Convex BaseConvexClient + ConvexHttpClient
 * - Integrates Better Auth via pluggable fetcher (setAuth)
 * - Caches JWT in sessionStorage with BroadcastChannel sync
 * - Auto-refreshes auth token ahead of expiry with jitter
 * - Provides:
 *   - watchQuery: live subscription with localQueryResult + onUpdate
 *   - query: HTTP one-shot with in-flight de-dupe + 401 retry
 *   - mutation: supports optimisticUpdate passthrough
 *   - action: HTTP call with 401 retry
 * - Does not change any runtime behavior – documentation and structure only.
 */
// src/app/convex-angular-client.ts
import {
  BaseConvexClient,
  type BaseConvexClientOptions,
  type OptimisticUpdate,
  ConvexHttpClient,
} from 'convex/browser';
import {
  FunctionReference,
  FunctionArgs,
  FunctionReturnType,
  getFunctionName,
} from 'convex/server';
import type { Value } from 'convex/values';
import type { FetchAccessToken, AuthSnapshot } from './types';
export type { FetchAccessToken, AuthSnapshot } from './types';
import { AUTH_KEY, AUTH_CH, jwtExpMs, stableStringify, safeSession } from './helpers';

type QueryToken = string;

type WatchHandle<Q extends FunctionReference<'query'>> = {
  localQueryResult(): FunctionReturnType<Q> | undefined;
  onUpdate(cb: () => void): () => void;
  unsubscribe(): void;
};

type Entry = {
  name: string;
  args: Record<string, Value>;
  listeners: Set<() => void>;
  unsubscribe: () => void;
};

type StoredToken = { value: string; exp: number };

/* helpers moved to ./helpers (no behavior change) */


const bc =
  typeof BroadcastChannel !== 'undefined'
    ? new BroadcastChannel(AUTH_CH)
    : (null as BroadcastChannel | null);

export class ConvexAngularClient {
  private authListeners = new Set<(s: AuthSnapshot) => void>();
  private lastSnap?: AuthSnapshot;
  // ==== internals ====
  private emitAuth() {
    const snap = this.getAuthSnapshot();
    // de-dupe emissions
    if (
      this.lastSnap &&
      this.lastSnap.isAuthenticated === snap.isAuthenticated &&
      this.lastSnap.token === snap.token
    ) {
      return;
    }
    this.lastSnap = snap;
    for (const cb of this.authListeners) cb(snap);
  }

  private base: BaseConvexClient;
  private http: ConvexHttpClient;
  private byToken = new Map<QueryToken, Entry>();

  private fetchToken?: FetchAccessToken;
  private inflightToken?: Promise<string | null>;
  private token?: StoredToken;

  private refreshTimer?: number;
  private inflightHttp = new Map<string, Promise<any>>();
  private authLocked = false;

  private readonly skewMs: number;

  constructor(url: string, opts?: BaseConvexClientOptions & { authSkewMs?: number }) {
    this.skewMs = opts?.authSkewMs ?? 30_000;

    this.base = new BaseConvexClient(
      url,
      (updatedTokens: QueryToken[]) => {
        for (const t of updatedTokens) {
          const e = this.byToken.get(t);
          if (!e) continue;
          for (const cb of e.listeners) cb();
        }
      },
      opts,
    );

    this.http = new ConvexHttpClient(url);

    // pick up cached token
    const raw = safeSession.get(AUTH_KEY);
    if (raw) {
      try {
        const t: StoredToken = JSON.parse(raw);
        if (t?.value && t?.exp && Date.now() < t.exp - this.skewMs) {
          this.token = t;
          this.http.setAuth(t.value);
          this.scheduleRefresh();
        }
      } catch {}
    }
    // 3) BroadcastChannel: keep as-is (clear only on 'clear', set on 'set')
    bc?.addEventListener('message', (ev: MessageEvent) => {
      const d: any = ev.data;
      if (d?.type === 'set') {
        if (this.authLocked) return; // ignore while logging out
        this.applyToken(d.token?.value ?? null);
      } else if (d?.type === 'clear') {
        this.applyToken(null);
      }
    });

    // visibility/network pokes
    const poke = () => {
      if (!this.freshTokenInCache()) void this.getToken(true);
    };
    if (typeof window !== 'undefined') {
      window.addEventListener('online', poke);
      document.addEventListener?.('visibilitychange', () => {
        if (document.visibilityState === 'visible') poke();
      });
    }
  }

  setAuth(fetcher: FetchAccessToken) {
    this.fetchToken = fetcher;
    this.base.setAuth(
      async ({ forceRefreshToken }) => (this.authLocked ? null : this.getToken(forceRefreshToken)),
      () => {
        // identity changed (connect/reconnect). Do NOT clear token here.
        // If we're truly logged out, next HTTP/WS use will 401 and we clear then.
        this.inflightToken = undefined;
        this.emitAuth(); // soft notify, no flip to false
      },
    );
  }

  /** Optional: call once on app start */
  async warmAuth(): Promise<void> {
    await this.getToken(true);
  }

  private freshTokenInCache(): string | null {
    if (!this.token) return null;
    return Date.now() < this.token.exp - this.skewMs ? this.token.value : null;
  }

  // ==== public auth helpers ====
  onAuth(cb: (s: AuthSnapshot) => void): () => void {
    cb(this.getAuthSnapshot());
    this.authListeners.add(cb);
    return () => this.authListeners.delete(cb);
  }

  logoutLocal(lock = true) {
    if (lock) this.authLocked = true;
    this.inflightToken = undefined;
    this.applyToken(null); // this is the ONLY place we hard clear locally
  }

  // 5) snapshot uses token presence (not freshness)
  getAuthSnapshot() {
    return {
      isAuthenticated: !!this.token?.value,
      token: this.token?.value ?? null,
      exp: this.token?.exp,
    };
  }

  /** Allow re-auth then fetch a fresh token (use after successful sign-in) */
  async refreshAuth(): Promise<void> {
    this.authLocked = false;
    await this.getToken(true);
  }

  // 4) applyToken: always emit after mutation (you already fixed this)
  private applyToken(token: string | null) {
    if (!token) {
      this.token = undefined;
      this.http.clearAuth();
      safeSession.del(AUTH_KEY);
      bc?.postMessage({ type: 'clear' });
      if (this.refreshTimer) window.clearTimeout(this.refreshTimer);
    } else {
      if (this.authLocked) {
        this.emitAuth();
        return;
      }
      const exp = jwtExpMs(token);
      this.token = { value: token, exp };
      this.http.setAuth(token);
      safeSession.set(AUTH_KEY, JSON.stringify(this.token));
      bc?.postMessage({ type: 'set', token: this.token });
      this.scheduleRefresh();
    }
    this.emitAuth();
  }

  private scheduleRefresh() {
    if (!this.token) return;
    if (this.refreshTimer) window.clearTimeout(this.refreshTimer);
    const jitter = 2_000 + Math.floor(Math.random() * 2_000);
    const due = Math.max(0, this.token.exp - this.skewMs - Date.now() - jitter);
    this.refreshTimer = window.setTimeout(() => {
      void this.getToken(true);
    }, due);
  }

  private async getToken(force: boolean): Promise<string | null> {
    if (!this.fetchToken || this.authLocked) return null; // 🔒 deny any token
    const cached = this.freshTokenInCache();
    if (!force && cached) return cached;

    if (!this.inflightToken) {
      this.inflightToken = (async () => {
        const t = await this.fetchToken!({ forceRefreshToken: true });
        // ignore token if we got locked while waiting
        if (this.authLocked) {
          this.emitAuth(); // ensure listeners see current (likely false)
          return null;
        }
        this.applyToken(t ?? null);
        return t ?? null;
      })().finally(() => setTimeout(() => (this.inflightToken = undefined), 0));
    }
    return await this.inflightToken;
  }

  private async ensureHttpAuth(): Promise<void> {
    await this.getToken(false);
  }

  // ——— live query ———
  watchQuery<Q extends FunctionReference<'query'>>(q: Q, args: FunctionArgs<Q>): WatchHandle<Q> {
    const name = getFunctionName(q);
    const valueArgs = (args ?? {}) as unknown as Record<string, Value>;
    const { queryToken, unsubscribe } = this.base.subscribe(name, valueArgs);

    const entry: Entry = { name, args: valueArgs, listeners: new Set(), unsubscribe };
    this.byToken.set(queryToken, entry);

    return {
      localQueryResult: () =>
        this.base.localQueryResult(name, valueArgs) as FunctionReturnType<Q> | undefined,
      onUpdate: (cb) => {
        entry.listeners.add(cb);
        return () => entry.listeners.delete(cb);
      },
      unsubscribe: () => {
        entry.unsubscribe();
        this.byToken.delete(queryToken);
      },
    };
  }

  // ——— mutation ———
  async mutation<M extends FunctionReference<'mutation'>>(
    m: M,
    args: FunctionArgs<M>,
    opts?: { optimisticUpdate?: OptimisticUpdate<FunctionArgs<M>> },
  ): Promise<FunctionReturnType<M>> {
    const name = getFunctionName(m);
    return this.base.mutation(
      name,
      args as any,
      opts?.optimisticUpdate ? { optimisticUpdate: opts.optimisticUpdate as any } : undefined,
    );
  }
  // ——— action (no dedupe) ———
  async action<A extends FunctionReference<'action'> & { _args: Record<string, never> }>(
    a: A,
  ): Promise<FunctionReturnType<A>>;
  async action<A extends FunctionReference<'action'>>(
    a: A,
    args: FunctionArgs<A>,
  ): Promise<FunctionReturnType<A>>;
  async action<A extends FunctionReference<'action'>>(
    a: A,
    args?: FunctionArgs<A>,
  ): Promise<FunctionReturnType<A>> {
    await this.ensureHttpAuth();

    const call = () => this.http.action(a, ...(args ? ([args] as any) : []));

    try {
      return await call();
    } catch (e: any) {
      const status = e?.status ?? e?.response?.status;
      if (this.fetchToken && status === 401) {
        await this.getToken(true);
        return await call();
      }
      throw e;
    }
  }

  // ——— one-shot query (HTTP with de-dupe) ———
  async query<Q extends FunctionReference<'query'> & { _args: Record<string, never> }>(
    q: Q,
  ): Promise<FunctionReturnType<Q>>;
  async query<Q extends FunctionReference<'query'>>(
    q: Q,
    args: FunctionArgs<Q>,
  ): Promise<FunctionReturnType<Q>>;
  async query<Q extends FunctionReference<'query'>>(
    q: Q,
    args?: FunctionArgs<Q>,
  ): Promise<FunctionReturnType<Q>> {
    await this.ensureHttpAuth();

    const name = getFunctionName(q);
    const key = name + ':' + (args ? stableStringify(args) : '');

    if (!this.inflightHttp.has(key)) {
      this.inflightHttp.set(
        key,
        (async () => {
          try {
            return await this.http.query(q, ...(args ? ([args] as any) : []));
          } catch (e: any) {
            const status = e?.status ?? e?.response?.status;
            if (this.fetchToken && status === 401) {
              await this.getToken(true);
              return await this.http.query(q, ...(args ? ([args] as any) : []));
            }
            throw e;
          } finally {
            setTimeout(() => this.inflightHttp.delete(key), 0);
          }
        })(),
      );
    }
    return this.inflightHttp.get(key)!;
  }
}
