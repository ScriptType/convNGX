/**
* Injection token and helper for accessing the Convex client from DI.
* Keep this tiny and stable — many helpers rely on it.
*/
import { inject, InjectionToken } from '@angular/core';
import { ConvexAngularClient } from './convex-angular-client';

/** DI token for the configured ConvexAngularClient instance */
export const CONVEX = new InjectionToken<ConvexAngularClient>('CONVEX');

/** Convenience helper to inject the Convex client */
export const injectConvex = () => inject(CONVEX);
