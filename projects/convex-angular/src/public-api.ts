/*
 * Public API Surface of convex-angular
 */

// Core client and DI token
export * from './lib/core/convex-angular-client';
export * from './lib/core/inject-convex.token';

// One-call setup provider (combine common providers)
export * from './lib/setup/convex-angular.providers';

// Better Auth + Convex provider
export * from './lib/auth/convex-better-auth.provider';
export * from './lib/auth/auth-client.provider';

// Angular resource helpers for Convex
export * from './lib/resources/live.resource';
export * from './lib/resources/mutation.resource';
export * from './lib/resources/action.resource';
