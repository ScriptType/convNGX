// convex-action-resource.ts
import {
  ResourceRef,
  ResourceStreamItem,
  computed,
  resource,
  signal,
  type Signal,
} from '@angular/core';
import { FunctionArgs, FunctionReference, FunctionReturnType } from 'convex/server';
import { injectConvex } from '../core/inject-convex.token';

export type ActionRef = FunctionReference<'action'>;
type NoArgsAction = ActionRef & { _args: Record<string, never> };
type IfEmptyArgs<A extends ActionRef, TIfEmpty, TIfNot> = keyof A['_args'] extends never
  ? TIfEmpty
  : TIfNot;

export interface ConvexActionOptions<A extends ActionRef> {
  onSuccess?: (data: FunctionReturnType<A>) => void;
  onError?: (err: Error) => void;
  /** concurrency: queue = sequential, drop = ignore while inflight, replace = prefer latest */
  mode?: 'queue' | 'drop' | 'replace';
  /** simple retry */
  retries?: number;
  retryDelayMs?: (attempt: number) => number;
}

type RunFn<A extends ActionRef> = IfEmptyArgs<
  A,
  (args?: FunctionArgs<A>) => Promise<FunctionReturnType<A>>,
  (args: FunctionArgs<A>) => Promise<FunctionReturnType<A>>
>;

export interface ConvexActionResource<A extends ActionRef> {
  run: RunFn<A>;
  state: ResourceRef<FunctionReturnType<A> | undefined>;
  data: Signal<FunctionReturnType<A> | undefined>;
  error: Signal<Error | undefined>;
  isRunning: Signal<boolean>;
  reset(): void;
}

/** Overloads for nice run() arg ergonomics */
export function convexActionResource<A extends NoArgsAction>(
  action: A,
  opts?: ConvexActionOptions<A>,
): ConvexActionResource<A>;
export function convexActionResource<A extends ActionRef>(
  action: A,
  opts?: ConvexActionOptions<A>,
): ConvexActionResource<A>;

/** Single impl */
export function convexActionResource<A extends ActionRef>(
  action: A,
  opts?: ConvexActionOptions<A>,
): ConvexActionResource<A> {
  const convex = injectConvex();
  const isRunning = signal(false);
  const inflight = signal<Promise<unknown> | undefined>(undefined);
  const pending = new Map<number, { resolve: (v: any) => void; reject: (e: any) => void }>();
  const trigger = signal<{ id: number; args: FunctionArgs<A> } | undefined>(undefined);
  let seq = 0;

  const state = resource<
    FunctionReturnType<A> | undefined,
    { id: number; args: FunctionArgs<A> } | undefined
  >({
    params: computed(() => trigger()),
    stream: async ({ params, abortSignal }) => {
      const out = signal<ResourceStreamItem<FunctionReturnType<A> | undefined>>({
        value: undefined,
      });
      if (!params) return out;

      const done = () => {
        const w = pending.get(params.id);
        if (w) pending.delete(params.id);
      };

      const runOnce = async () => {
        let attempt = 0;
        const retries = opts?.retries ?? 0;
        const delay = (n: number) =>
          new Promise((r) => setTimeout(r, opts?.retryDelayMs?.(n) ?? 500 * n));

        while (true) {
          try {
            const res = await convex.action(action, params.args);
            if (!abortSignal.aborted) {
              out.set({ value: res });
              opts?.onSuccess?.(res);
              pending.get(params.id)?.resolve(res);
            }
            done();
            return;
          } catch (e) {
            const err = e instanceof Error ? e : new Error(String(e));
            if (!abortSignal.aborted) out.set({ error: err });
            if (attempt >= retries) {
              opts?.onError?.(err);
              pending.get(params.id)?.reject(err);
              done();
              return;
            }
            attempt++;
            await delay(attempt);
          }
        }
      };

      isRunning.set(true);
      try {
        const p = runOnce();
        inflight.set(p);
        await p;
      } finally {
        if (!abortSignal.aborted) isRunning.set(false);
        if (inflight() && (await inflight()) === undefined) inflight.set(undefined);
      }

      return out;
    },
  });

  const data = computed(() => state.value());
  const error = computed(() => state.error());

  const run: RunFn<A> = (async (args?: FunctionArgs<A>) => {
    const job = { id: ++seq, args: (args ?? ({} as any)) as FunctionArgs<A> };

    if (opts?.mode === 'drop' && inflight()) {
      return inflight() as Promise<FunctionReturnType<A>>;
    }
    if (opts?.mode === 'queue' && inflight()) {
      await inflight();
    }

    const promise = new Promise<FunctionReturnType<A>>((resolve, reject) => {
      pending.set(job.id, { resolve, reject });
    });

    trigger.set(job); // "replace" naturally supersedes older emissions
    return promise;
  }) as RunFn<A>;

  const reset = () => {
    (state as any).reset?.();
  };

  return { run, state, data, error, isRunning: isRunning.asReadonly(), reset };
}
