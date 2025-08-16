import { betterAuth } from 'better-auth';
import { convexAdapter } from '@convex-dev/better-auth';
import { convex, crossDomain } from '@convex-dev/better-auth/plugins';
import { betterAuthComponent } from '../convex/auth';
import type { GenericCtx } from '../convex/_generated/server';

const siteUrl = 'http://localhost:4200'; // Angular app origin

export const createAuth = (ctx: GenericCtx) =>
  betterAuth({
    trustedOrigins: [siteUrl],
    database: convexAdapter(ctx, betterAuthComponent),
    emailAndPassword: { enabled: true, requireEmailVerification: false },
    plugins: [convex(), crossDomain({ siteUrl })],
  });
