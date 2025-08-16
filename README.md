# convNGX

Angular + Convex, made simple. A tiny library that wraps the Convex client with Better Auth and gives you Angular Resources for live data, mutations, and actions.

- Zero-boilerplate DI setup
- Live queries as Angular resources (keep-last, manual reload)
- Mutations with optimistic updates, retries, and simple concurrency
- Actions with the same ergonomics
- Works with your Convex project and Better Auth out of the box

Demo app: [projects/example-chat](projects/example-chat/)
Docs: [projects/convex-angular/README.md](projects/convex-angular/README.md)

## Why convNGX?

Stop wiring clients and subscriptions by hand. Use Angular-native primitives that feel like Signals and Resources—because they are.

## Assumptions

This library assumes your Convex backend uses Better Auth (via `@convex-dev/better-auth`) and exposes the Better Auth HTTP endpoints on your Convex site (e.g. `https://YOUR.convex.site`). The Angular provider handles token refresh automatically.

## Get started (1 minute)

Install peer deps:

```bash
npm i convex @convex-dev/better-auth better-auth
```

Add the provider to your bootstrap:

```ts
import { bootstrapApplication } from '@angular/platform-browser';
import { provideConvexAngular } from '@convngx/angular';
import { AppComponent } from './app';

bootstrapApplication(AppComponent, {
  providers: [
    provideConvexAngular({
      convexUrl: 'https://YOUR.convex.cloud',
      authBaseURL: 'https://YOUR.convex.site',
    }),
  ],
});
```

## Live queries: convexLiveResource

Angular Resource wrapper around Convex watchQuery with smart gating, keep-last, and manual reload, and smart Caching.

Core usage:

```ts
import { convexLiveResource } from 'convngx';
import { api } from '@/convex/_generated/api';

// Live updated with angular resource api
const todosRes = convexLiveResource(api.todos.list);
const todos = computed(() => this.todoRes.value())
const todoLoading = computed(() => this.todoRes.isLoading())

// With params (resource auto-disables when params() returns undefined)
const filter = signal('');

// Completly reactive! And cached!
const messagesRes = convexLiveResource(
  api.messages.getFilteredMessagesByContent,
  () => ({ content: filter() || undefined }),
);

// Opt out of keep-last value (immediate undefined on param change)
const resNoKeep = convexLiveResource(api.todos.list, { keep: 'none' });

// Manual refresh (also performs a one-shot .query to seed the latest value)
messagesRes.reload();
```

## Built‑in auth state (stays in sync)

Get a reactive auth flag that updates automatically across tabs and refreshes tokens in the background. The example app exposes a tiny service using the provided client:

```ts
// app/state/convex-auth.state.ts
import { Injectable, computed, inject, signal } from '@angular/core';
import { CONVEX, type ConvexAngularClient } from '@convngx/angular';

@Injectable({ providedIn: 'root' })
export class ConvexAuthState {
  private readonly convex = inject<ConvexAngularClient>(CONVEX);
  private readonly _isAuthed = signal(this.convex.getAuthSnapshot().isAuthenticated);
  readonly isAuthenticated = computed(() => this._isAuthed());

  constructor() {
    this.convex.onAuth(s => this._isAuthed.set(s.isAuthenticated));
  }
}
```

- Auto-refreshes tokens ahead of expiry
- Cross-tab sync (open in multiple tabs and it just works)
- `isAuthenticated` stays current without manual glue code

See the example: [projects/example-chat/src/app/state/convex-auth.state.ts](projects/example-chat/src/app/state/convex-auth.state.ts)

## Explore the example

- App code: [projects/example-chat](projects/example-chat/)
- Chat component: [chat.component.ts](projects/example-chat/src/app/components/chat/chat.component.ts)
- Convex functions: [convex/messages.ts](convex/messages.ts), [convex/users.ts](convex/users.ts)

## Documentation

- Read the full docs, API, and advanced usage: [projects/convex-angular/README.md](projects/convex-angular/README.md)
- Key APIs: [live.resource.ts](projects/convex-angular/src/lib/resources/live.resource.ts), [mutation.resource.ts](projects/convex-angular/src/lib/resources/mutation.resource.ts), [action.resource.ts](projects/convex-angular/src/lib/resources/action.resource.ts)

## License

MIT
