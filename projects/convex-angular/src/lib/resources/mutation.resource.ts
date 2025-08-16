// convex-mutation-resource.ts
import {
  ResourceRef,
  ResourceStreamItem,
  computed,
  resource,
  signal,
  type Signal,
} from '@angular/core';
import type { OptimisticUpdate } from 'convex/browser';
import { FunctionArgs, FunctionReference, FunctionReturnType } from 'convex/server';
import { injectConvex } from '../core/inject-convex.token';

export type MutationRef = FunctionReference<'mutation'>;
type NoArgsMutation = MutationRef & { _args: Record<string, never> };
type IfEmptyArgs<M extends MutationRef, TIfEmpty, TIfNot> = keyof M['_args'] extends never
  ? TIfEmpty
  : TIfNot;

export interface ConvexMutationOptions<M extends MutationRef> {
  optimisticUpdate?: OptimisticUpdate<FunctionArgs<M>>;
  onSuccess?: (data: FunctionReturnType<M>) => void;
  onError?: (err: Error) => void;
  /** concurrency: queue = sequential, drop = ignore while inflight, replace = prefer latest */
  mode?: 'queue' | 'drop' | 'replace';
  /** simple retry */
  retries?: number;
  retryDelayMs?: (attempt: number) => number;
}

type RunFn<M extends MutationRef> = IfEmptyArgs<
  M,
  (args?: FunctionArgs<M>) => Promise<FunctionReturnType<M>>,
  (args: FunctionArgs<M>) => Promise<FunctionReturnType<M>>
>;

export interface ConvexMutationResource<M extends MutationRef> {
  /** imperative trigger */
  run: RunFn<M>;
  /** resource-shaped state (bind in templates if you like) */
  state: ResourceRef<FunctionReturnType<M> | undefined>;
  /** convenience signals */
  data: Signal<FunctionReturnType<M> | undefined>;
  error: Signal<Error | undefined>;
  isRunning: Signal<boolean>;
  reset(): void;
}

/** Overloads for nice run() arg ergonomics */
export function convexMutationResource<M extends NoArgsMutation>(
  mutation: M,
  opts?: ConvexMutationOptions<M>,
): ConvexMutationResource<M>;
export function convexMutationResource<M extends MutationRef>(
  mutation: M,
  opts?: ConvexMutationOptions<M>,
): ConvexMutationResource<M>;

/** Single impl */
export function convexMutationResource<M extends MutationRef>(
  mutation: M,
  opts?: ConvexMutationOptions<M>,
): ConvexMutationResource<M> {
  const convex = injectConvex();
  const isRunning = signal(false);
  const pending = new Map<number, { resolve: (v: any) => void; reject: (e: any) => void }>();
  const inflight = signal<Promise<unknown> | undefined>(undefined);
  const trigger = signal<{ id: number; args: FunctionArgs<M> } | undefined>(undefined);
  let seq = 0;

  const state = resource<
    FunctionReturnType<M> | undefined,
    { id: number; args: FunctionArgs<M> } | undefined
  >({
    params: computed(() => trigger()),
    stream: async ({ params, abortSignal }) => {
      const out = signal<ResourceStreamItem<FunctionReturnType<M> | undefined>>({
        value: undefined,
      });
      if (!params) return out;

      const done = () => {
        // clean out waiter if still present
        const w = pending.get(params.id);
        if (w) pending.delete(params.id);
      };

      const runOnce = async () => {
        let attempt = 0;
        const retries = opts?.retries ?? 0;
        const delay = (n: number) =>
          new Promise((r) => setTimeout(r, opts?.retryDelayMs?.(n) ?? 500 * n));

        // NB: Convex mutations don’t support abort; we still observe abortSignal to stop emitting.
        // We *do not* call mutation again on aborted; we just stop updating UI.
        // If you choose mode: 'replace', older runs get superseded by newer trigger()s.
        // That’s the main “cancellation” we can mimic here.
        while (true) {
          try {
            const res = await convex.mutation(mutation, params.args, {
              optimisticUpdate: opts?.optimisticUpdate,
            });
            if (!abortSignal.aborted) {
              out.set({ value: res });
              opts?.onSuccess?.(res);
              pending.get(params.id)?.resolve(res);
            }
            done();
            return;
          } catch (e) {
            const err = e instanceof Error ? e : new Error(String(e));
            if (!abortSignal.aborted) {
              out.set({ error: err });
            }
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

  const run: RunFn<M> = (async (args?: FunctionArgs<M>) => {
    const job = { id: ++seq, args: (args ?? ({} as any)) as FunctionArgs<M> };

    if (opts?.mode === 'drop' && inflight()) {
      // return the inflight promise if present (best-effort)
      return inflight() as Promise<any>;
    }

    if (opts?.mode === 'queue' && inflight()) {
      await inflight();
    }

    const promise = new Promise<FunctionReturnType<M>>((resolve, reject) => {
      pending.set(job.id, { resolve, reject });
    });

    // "replace": push new job; older job’s UI will be superseded by the next emission
    trigger.set(job);
    return promise;
  }) as RunFn<M>;

  const reset = () => {
    // clear UI state; does not affect in-flight promise
    (state as any).reset?.(); // safe if Angular adds reset later; otherwise ignore
  };

  return { run, state, data, error, isRunning: isRunning.asReadonly(), reset };
}
