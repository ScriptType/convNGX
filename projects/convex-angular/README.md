# convNGX

Angular-first utilities for Convex with Better Auth:
- DI-wrapped Convex client with Better Auth token refresh
- Angular Resources for live queries, mutations, and actions
- One-call setup provider (no environment.ts in the lib)
- Resource ergonomics: params-gated queries, keep-last value, reload control, mutation concurrency modes, retries, optimistic updates

Demo app: projects/example-chat (Angular + Convex + Better Auth)

## Install peer deps

Use your app's package.json; this library provides Angular wrappers and expects Convex + Better Auth to be available.

```bash
npm i convex @convex-dev/better-auth better-auth
```
## Assumptions

This library assumes your Convex backend uses Better Auth (via `@convex-dev/better-auth`) and exposes the Better Auth HTTP endpoints on your Convex site (e.g. `https://YOUR.convex.site`). The Angular providers wire the Convex client to Better Auth, handle proactive token refresh, and optionally support cross‑domain OTT handoff.

## Quick start (Angular)

Register the provider once in your bootstrap:

```ts
import { bootstrapApplication } from '@angular/platform-browser';
import { provideConvexAngular } from 'convngx';
import { AppComponent } from './app';

bootstrapApplication(AppComponent, {
  providers: [
    provideConvexAngular({
      convexUrl: 'https://YOUR.convex.cloud',
      authBaseURL: 'https://YOUR.convex.site', // Better Auth base (your Convex site)
      authSkewMs: 45_000,                      // optional
      keep: 'last',                            // default keep mode for live resources
    }),
    // Optional cross-domain OTT handoff bootstrap (call separately)
    // provideBetterAuthOttBootstrap(),
  ],
});
```

Inject the Convex client anywhere:

```ts
import { injectConvex } from 'convngx';

const convex = injectConvex();
// convex.query(...), convex.watchQuery(...), convex.mutation(...), convex.action(...)
```

## Live queries: convexLiveResource

Angular Resource wrapper around Convex watchQuery with smart gating, keep-last, and manual reload.

Core usage:

```ts
import { convexLiveResource } from 'convngx';
import { api } from '@/convex/_generated/api';

// No-args query
const todosRes = convexLiveResource(api.todos.list);

// With params (resource auto-disables when params() returns undefined)
const filter = signal('');
const messagesRes = convexLiveResource(
  api.messages.getFilteredMessagesByContent,
  () => ({ content: filter() || undefined }),
);

// Opt out of keep-last value (immediate undefined on param change)
const resNoKeep = convexLiveResource(api.todos.list, { keep: 'none' });

// Manual refresh (also performs a one-shot .query to seed the latest value)
messagesRes.reload();
```

Behavior details
- Params gating: When you pass a params factory `() => args | undefined`, the resource remains disabled until a non-undefined value is returned. For no-args queries, the resource is always enabled.
- Keep mode: By default `keep: 'last'`, the last successful value is kept visible while parameters change and the next subscription warms up. Set `keep: 'none'` to clear stale values immediately on change.
- Live + one-shot fetch: A Convex `watchQuery` subscription is established for live updates. A one-time `query` call runs only when you call `.reload()` (useful for guaranteed freshness).
- Errors: Any thrown errors during local result access or network updates are surfaced via the resource’s `error()`.

Type overloads (for reference)
```ts
function convexLiveResource<Q extends FunctionReference<'query'> & { _args: {} }>(
  query: Q,
  opts?: { keep?: 'none' | 'last' },
): ResourceRef<FunctionReturnType<Q> | undefined>;

function convexLiveResource<Q extends FunctionReference<'query'> & { _args: {} }>(
  query: Q,
  params: () => {} | undefined,
  opts?: { keep?: 'none' | 'last' },
): ResourceRef<FunctionReturnType<Q> | undefined>;

function convexLiveResource<Q extends FunctionReference<'query'>>(
  query: Q,
  params: () => Q['_args'] | undefined,
  opts?: { keep?: 'none' | 'last' },
): ResourceRef<FunctionReturnType<Q> | undefined>;
```

Global default for keep mode (optional DI)
```ts
import { provideConvexResourceOptions } from 'convngx';

bootstrapApplication(App, {
  providers: [
    provideConvexResourceOptions({ keep: 'none' }),
  ],
});
```

Implementation: src/lib/resources/live.resource.ts

## Mutations: convexMutationResource

A mutation helper that returns an imperative `run()` plus resource-shaped state and derived signals. Supports optimistic updates, callbacks, basic concurrency controls, and retries.

```ts
import { convexMutationResource } from 'convngx';
import { api } from '@/convex/_generated/api';

// Minimal
const createTodo = convexMutationResource(api.todos.create);

// With options
const sendMessage = convexMutationResource(api.messages.sendMessage, {
  // Convex OptimisticUpdate signature: (store, args) => void
  optimisticUpdate: (store, args) => {
    store.setQuery(api.messages.getFilteredMessagesByContent, { content: '' }, prev => [
      { _id: 'tmp', content: args.content, timestamp: Date.now() },
      ...(prev ?? []),
    ]);
  },
  onSuccess: (data) => console.log('created', data),
  onError: (err) => console.error(err),
  mode: 'replace',        // 'queue' | 'drop' | 'replace'
  retries: 2,             // simple retry count
  retryDelayMs: n => 400 * n,
});

// In a component
if (!sendMessage.isRunning()) {
  await sendMessage.run({ content: 'Hello' });
}

// Bind in templates if you like
// sendMessage.state.value(), sendMessage.state.error()
// sendMessage.data(), sendMessage.error(), sendMessage.isRunning()
```

Concurrency modes
- replace: default; a new run supersedes the UI of the previous run
- drop: ignore new run() calls while a previous run is in flight
- queue: wait for the current run to finish, then start the next

Return shape
```ts
type ConvexMutationResource<M> = {
  run: (args?: ArgsOf<M>) => Promise<ReturnOf<M>>;
  state: ResourceRef<ReturnOf<M> | undefined>;
  data: Signal<ReturnOf<M> | undefined>;
  error: Signal<Error | undefined>;
  isRunning: Signal<boolean>;
  reset(): void; // clears UI state (does not cancel inflight work)
};
```

Implementation: src/lib/resources/mutation.resource.ts

## Actions: convexActionResource

Identical ergonomics to mutations but calls `convex.action`. Useful for long-running or external API calls.

```ts
import { convexActionResource } from 'convngx';
import { api } from '@/convex/_generated/api';

const exportData = convexActionResource(api.reports.export, {
  retries: 3,
  mode: 'queue',
});

await exportData.run({ range: 'last30d' });
```

Implementation: src/lib/resources/action.resource.ts

## Auth integration (Better Auth)

The client wires in Better Auth so the Convex browser client always has a fresh token; OTT flow is optionally supported.

- Provide Better Auth HTTP client: src/lib/auth/auth-client.provider.ts
- Wire Convex client to auth: src/lib/auth/convex-better-auth.provider.ts
- One-call setup provider: src/lib/setup/convex-angular.providers.ts
- DI token to inject the Convex client: src/lib/core/inject-convex.token.ts
- Client implementation with token refresh: src/lib/core/convex-angular-client.ts

Minimal Convex Better Auth server (lives in your Convex project, not in this library):

```ts
// convex/auth.ts (in your Convex backend)
import { betterAuth } from 'better-auth';
import { convexAdapter } from '@convex-dev/better-auth';
import { convex, crossDomain } from '@convex-dev/better-auth/plugins';
import type { GenericCtx } from './_generated/server';

export const createAuth = (ctx: GenericCtx) =>
  betterAuth({
    database: convexAdapter(ctx, /* your Better Auth component */ undefined as any),
    emailAndPassword: { enabled: true, requireEmailVerification: false },
    plugins: [
      convex(),
      crossDomain({ siteUrl: 'http://localhost:4200' }), // Your Angular origin
    ],
## Auth state (reactive, technical)

This library exposes auth snapshots and events on the Convex client so you can build a tiny, reactive auth state that stays in sync across tabs and refreshes tokens in the background.

- Snapshot: [ConvexAngularClient.getAuthSnapshot()](src/lib/core/convex-angular-client.ts:177)
- Updates: [ConvexAngularClient.onAuth()](src/lib/core/convex-angular-client.ts:165)
- Manual helpers: [ConvexAngularClient.refreshAuth()](src/lib/core/convex-angular-client.ts:186), [ConvexAngularClient.logoutLocal()](src/lib/core/convex-angular-client.ts:171), [ConvexAngularClient.warmAuth()](src/lib/core/convex-angular-client.ts:154)
- DI: [CONVEX](src/lib/core/inject-convex.token.ts:9) and [injectConvex()](src/lib/core/inject-convex.token.ts:12)
- Optional OTT bootstrap: [provideBetterAuthOttBootstrap()](src/lib/auth/convex-better-auth.provider.ts:66)
- Combined provider: [provideConvexAngular()](src/lib/setup/convex-angular.providers.ts:28)

Example service (from the chat app) that derives a reactive `isAuthenticated`:

```ts
// projects/example-chat/src/app/state/convex-auth.state.ts
import { Injectable, computed, inject, signal } from '@angular/core';
import { CONVEX, type ConvexAngularClient } from 'convngx';

@Injectable({ providedIn: 'root' })
export class ConvexAuthState {
  private readonly convex = inject<ConvexAngularClient>(CONVEX);
  private readonly _isAuthed = signal(this.convex.getAuthSnapshot().isAuthenticated);
  readonly isAuthenticated = computed(() => this._isAuthed());

  constructor() {
    this.convex.onAuth((s) => this._isAuthed.set(s.isAuthenticated));
  }
}
```

Notes:
- Tokens are proactively refreshed ahead of expiry (skew/jitter) and synchronized across tabs via BroadcastChannel in the client.
- `onAuth` emits immediately with the current snapshot, then on any login/logout/token change.
- The example lives at [convex-auth.state.ts](../../example-chat/src/app/state/convex-auth.state.ts:1).
  });
```

## Example app (Chat)

The repository contains a small chat app showing live queries + mutations:
- Component: projects/example-chat/src/app/components/chat/chat.component.ts
- Template: projects/example-chat/src/app/components/chat/chat.component.html
- Auth store: projects/example-chat/src/app/state/auth.store.ts
- Convex functions: convex/messages.ts, convex/users.ts

Snippet from the chat component:

```ts
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { convexLiveResource, convexMutationResource } from 'convngx';
import { api } from 'convex/_generated/api';

@Component({ /* ... */ })
export class ChatComponent {
  sendMessageMutation = convexMutationResource(api.messages.sendMessage);
  filter = signal('');
  messages = convexLiveResource(api.messages.getFilteredMessagesByContent, () => ({ content: this.filter() }));

  async sendMessage() {
    const content = this.newMessage().trim();
    if (!content || this.sendMessageMutation.isRunning()) return;
    await this.sendMessageMutation.run({ content });
    this.newMessage.set('');
  }
}
```

## API surface (map)

- Core DI and client:
  - injectConvex(): src/lib/core/inject-convex.token.ts
  - Convex client: src/lib/core/convex-angular-client.ts
- Auth:
  - Better Auth HTTP client provider: src/lib/auth/auth-client.provider.ts
  - Convex + Better Auth wiring: src/lib/auth/convex-better-auth.provider.ts
- Resources:
  - Live queries: src/lib/resources/live.resource.ts
  - Mutations: src/lib/resources/mutation.resource.ts
  - Actions: src/lib/resources/action.resource.ts
- Setup:
  - One-call provider: src/lib/setup/convex-angular.providers.ts

## Build

```bash
ng build convngx-angular
```

Outputs to dist/convngx.

## License

MIT
