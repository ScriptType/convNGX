// convex-resource.ts
import {
  ResourceRef,
  ResourceStreamItem,
  computed,
  inject,
  resource,
  signal,
  InjectionToken,
  Provider,
} from '@angular/core';
import { FunctionReference, FunctionReturnType } from 'convex/server';
import { injectConvex } from '../core/inject-convex.token';

export type QueryRef = FunctionReference<'query'>;
export type KeepMode = 'none' | 'last';

export interface ConvexResourceOptions {
  keep?: KeepMode;
}

const DEFAULTS: Required<ConvexResourceOptions> = { keep: 'last' };

export const CONVEX_RESOURCE_OPTIONS = new InjectionToken<Required<ConvexResourceOptions>>(
  'CONVEX_RESOURCE_OPTIONS',
  { factory: () => DEFAULTS },
);

export function provideConvexResourceOptions(opts: Partial<ConvexResourceOptions>): Provider {
  return { provide: CONVEX_RESOURCE_OPTIONS, useValue: { ...DEFAULTS, ...opts } };
}

// “no-args” queries have `_args` compatible with {}
type NoArgsQuery = QueryRef & { _args: Record<string, never> };

/** Overloads */
export function convexLiveResource<Q extends NoArgsQuery>(
  query: Q,
  opts?: ConvexResourceOptions,
): ResourceRef<FunctionReturnType<Q> | undefined>;
export function convexLiveResource<Q extends NoArgsQuery>(
  query: Q,
  params: () => {} | undefined,
  opts?: ConvexResourceOptions,
): ResourceRef<FunctionReturnType<Q> | undefined>;
export function convexLiveResource<Q extends QueryRef>(
  query: Q,
  params: () => Q['_args'] | undefined,
  opts?: ConvexResourceOptions,
): ResourceRef<FunctionReturnType<Q> | undefined>;

/** Impl */
export function convexLiveResource<Q extends QueryRef>(
  query: Q,
  a?: (() => Q['_args'] | undefined) | ConvexResourceOptions,
  b?: ConvexResourceOptions,
): ResourceRef<FunctionReturnType<Q> | undefined> {
  const convex = injectConvex();
  const global = inject(CONVEX_RESOURCE_OPTIONS);
  const keepMode = (typeof a === 'function' ? b : a)?.keep ?? global.keep;

  const paramsFactory: (() => Q['_args'] | undefined) | undefined =
    typeof a === 'function' ? a : undefined;

  const lastGlobal = signal<FunctionReturnType<Q> | undefined>(undefined);

  const argsSig = computed<Q['_args'] | undefined>(() => {
    if (!paramsFactory) return {} as Q['_args']; // no-args: always enabled
    return paramsFactory();
  });

  // --- reload tagging ---
  const reloadStamp = signal(0); // increments only when .reload() is called
  let lastSeenReload = 0; // compared inside stream to detect reload

  type ParamEnvelope = { args: Q['_args'] | undefined; __r: number } | undefined;

  const request = computed<ParamEnvelope>(() => ({
    args: argsSig(),
    __r: reloadStamp(),
  }));

  const base = resource<FunctionReturnType<Q> | undefined, ParamEnvelope>({
    params: request,
    stream: async ({ params, abortSignal }) => {
      const s = signal<ResourceStreamItem<FunctionReturnType<Q> | undefined>>({
        value: keepMode === 'last' ? lastGlobal() : undefined,
      });

      if (!params || !params.args) return s; // gated
      const isReload = params.__r !== lastSeenReload;
      lastSeenReload = params.__r;

      // One-shot fetch: ONLY on reload
      if (isReload) {
        convex
          .query(query, params.args)
          .then((next) => {
            if (abortSignal.aborted) return;
            s.set({ value: next });
            lastGlobal.set(next);
          })
          .catch((err) => {
            if (abortSignal.aborted) return;
            s.set({ error: err as Error });
          });
      }

      // Live subscription (always)
      const w = convex.watchQuery(query, params.args as Q['_args']);

      try {
        const local = w.localQueryResult();
        if (local !== undefined) {
          s.set({ value: local });
          lastGlobal.set(local);
        }
      } catch (err) {
        s.set({ error: err as Error });
      }

      const off = w.onUpdate(() => {
        try {
          const next = w.localQueryResult();
          s.set({ value: next });
          lastGlobal.set(next);
        } catch (err) {
          s.set({ error: err as Error });
        }
      });

      abortSignal.addEventListener('abort', () => off(), { once: true });
      return s;
    },
  });

  // Wrap to bump reloadStamp only when user calls reload()
  const origReload = base.reload.bind(base);

  const wrapped: ResourceRef<FunctionReturnType<Q> | undefined> = {
    ...base,
    reload: () => {
      reloadStamp.set(reloadStamp() + 1);
      return origReload();
    },
  };

  return wrapped;
}
