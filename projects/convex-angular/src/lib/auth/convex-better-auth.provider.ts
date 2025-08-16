/**
 * Convex + Better Auth providers.
 * - provideConvexBetterAuth: Registers a ConvexAngularClient in DI and wires Better Auth token fetching.
 * - provideBetterAuthOttBootstrap: Optional environment initializer to handle cross-domain one-time-token.
 *
 * No functional changes—cleaned comments and added docs.
 */
import { inject, provideEnvironmentInitializer, Provider } from '@angular/core';
import { AUTH_CLIENT } from './auth-client.provider';
import { CONVEX } from '../core/inject-convex.token';
import { ConvexAngularClient, FetchAccessToken } from '../core/convex-angular-client';

/** Minimal surface this library relies on from Better Auth client */
interface AuthClientRequired {
  convex: { token: () => Promise<{ data?: { token?: string } | null }> };
  crossDomain: {
    oneTimeToken: {
      verify: (args: { token: string }) => Promise<{ data?: { session?: { token?: string } } }>;
    };
  };
  getSession: (o?: { fetchOptions?: RequestInit }) => Promise<unknown>;
  updateSession: () => void;
}
export interface ConvexBetterAuthOptions {
  /** Convex deployment URL, e.g. https://xxx.convex.cloud */
  convexUrl: string;
  /** Milliseconds before JWT expiry to refresh (default 45s in this provider) */
  authSkewMs?: number;

  authClient?: AuthClientRequired; // Optional user-provided Better Auth client
}

/**
 * Registers the Convex client in DI and connects it to Better Auth for JWT retrieval.
 * Consumers still need to provide the Better Auth HTTP client via provideAuthClient().
 */
export function provideConvexBetterAuth(opts: ConvexBetterAuthOptions): Provider[] {
  return [
    {
      provide: CONVEX,
      useFactory: () => {
        const client = new ConvexAngularClient(opts.convexUrl, {
          authSkewMs: opts.authSkewMs ?? 45_000,
        });

        const auth = inject(AUTH_CLIENT) as AuthClientRequired;

        const fetchAccessToken: FetchAccessToken = async ({ forceRefreshToken }) => {
          if (!forceRefreshToken) return null;
          const { data } = await auth.convex.token();
          return data?.token ?? null;
        };

        client.setAuth(fetchAccessToken);
        void client.warmAuth();
        return client;
      },
    },
  ];
}

/**
 * Optional environment initializer to handle OTT (?ott=...) once and upgrade to a cookie session.
 * Keep separate from main provider for explicit opt-in.
 */
export function provideBetterAuthOttBootstrap() {
  return provideEnvironmentInitializer(() => {
    (async () => {
      const auth = inject(AUTH_CLIENT) as AuthClientRequired;
      const url = new URL(window.location.href);
      const ott = url.searchParams.get('ott');
      if (!ott) return;

      const result = await auth.crossDomain.oneTimeToken.verify({ token: ott });
      const session = result?.data?.session;
      if (session?.token) {
        await auth.getSession({
          fetchOptions: {
            credentials: 'include',
            headers: { Authorization: `Bearer ${session.token}` },
          },
        });
        auth.updateSession();
      }
      url.searchParams.delete('ott');
      window.history.replaceState({}, '', url.toString());
    })();
  });
}
