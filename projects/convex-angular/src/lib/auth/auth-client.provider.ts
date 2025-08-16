import { InjectionToken, Provider } from '@angular/core';
import { createAuthClient } from 'better-auth/client';
import { convexClient, crossDomainClient } from '@convex-dev/better-auth/client/plugins';

type AuthConfig = {
  baseURL: string;
  plugins: [ReturnType<typeof convexClient>, ReturnType<typeof crossDomainClient>];
  fetchOptions: { credentials: 'include' };
};

export type AuthClient = ReturnType<typeof createAuthClient<AuthConfig>>;

export interface ProvideAuthClientOptions {
  baseURL: string;
  fetchOptions?: RequestInit;
}

/**
 * Un-typed DI token. We don't re-export types; callers who create the client
 * get full type safety from better-auth directly.
 */
export const AUTH_CLIENT = new InjectionToken<AuthClient>('AUTH_CLIENT');

/** Provide a configured Better Auth client via DI (default convex+crossDomain plugins) */
export function provideAuthClient(opts: ProvideAuthClientOptions): Provider {
  return {
    provide: AUTH_CLIENT,
    useFactory: () =>
      createAuthClient({
        baseURL: opts.baseURL,
        plugins: [convexClient(), crossDomainClient()],
        fetchOptions: { credentials: 'include', ...(opts.fetchOptions ?? {}) },
      }),
  };
}
