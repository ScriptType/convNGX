import { Provider } from '@angular/core';
import { AUTH_CLIENT, provideAuthClient, type AuthClient } from '../auth/auth-client.provider';
import { provideConvexBetterAuth } from '../auth/convex-better-auth.provider';
import { provideConvexResourceOptions, type KeepMode } from '../resources/live.resource';

export interface ConvexAngularOptions {
  /** Convex deployment URL, e.g. https://xxx.convex.cloud */
  convexUrl: string;
  /** Better Auth base URL (convex site url), e.g. https://xxx.convex.site */
  authBaseURL: string;
  /** Skew before JWT expiry to refresh token */
  authSkewMs?: number;
  /** Default keep mode for live resources ('last' | 'none') */
  keep?: KeepMode;
  /**
   * Optional: user-provided Better Auth client.
   * Must include convexClient() and crossDomainClient() plugins.
   */
  authClient?: AuthClient;
}

/**
 * Single entry-point provider to wire Convex + Better Auth + resource defaults.
 * Behavior:
 * - If opts.authClient is provided, we use it (and verify required plugins).
 * - Else we create a default Better Auth client using authBaseURL with required plugins.
 */
export function provideConvexAngular(opts: ConvexAngularOptions): Provider[] {
  const providers: Provider[] = [];

  if (opts.authClient) {
    providers.push({
      provide: AUTH_CLIENT,
      useFactory: () => {
        const c = opts.authClient as AuthClient;
        const hasConvex = typeof c.convex?.token === 'function';
        const hasCross = typeof c.crossDomain?.oneTimeToken?.verify === 'function';
        if (!hasConvex || !hasCross) {
          throw new Error(
            'Provided AUTH client is missing required plugins: convexClient() and crossDomainClient().',
          );
        }
        return c;
      },
    });
  } else {
    // Default client with known plugin set (convex + crossDomain)
    providers.push(
      provideAuthClient({
        baseURL: opts.authBaseURL,
      }),
    );
  }

  providers.push(
    ...provideConvexBetterAuth({
      convexUrl: opts.convexUrl,
      authSkewMs: opts.authSkewMs,
    }),
  );

  if (opts.keep) {
    providers.push(provideConvexResourceOptions({ keep: opts.keep }));
  }
  return providers;
}
