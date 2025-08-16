import {
  ApplicationConfig,
  provideBrowserGlobalErrorListeners,
  provideZoneChangeDetection,
} from '@angular/core';
import { provideConvexAngular, provideBetterAuthOttBootstrap } from 'convngx';
import { environment } from '../environments/environment';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideConvexAngular({
      convexUrl: environment.convexUrl,
      authBaseURL: environment.authBaseURL,
      authSkewMs: environment.authSkewMs,
      keep: environment.keep,
    }),
    provideBetterAuthOttBootstrap(),
  ],
};
