import { Injectable, computed, effect, inject, signal } from '@angular/core';
import {
  AUTH_CLIENT,
  CONVEX,
  convexLiveResource,
  type AuthClient,
  type ConvexAngularClient,
} from 'convngx';
import { ConvexAuthState } from './convex-auth.state';
import { api } from '../../convex/_generated/api';

@Injectable({ providedIn: 'root' })
export class AuthStore {
  private authClient = inject(AUTH_CLIENT);
  private convex = inject(CONVEX);
  private auth = inject(ConvexAuthState);

  private me = convexLiveResource(
    api.users.getCurrentUser,
    () => (this.auth.isAuthenticated() ? {} : undefined),
    { keep: 'last' },
  );

  readonly isLoading = signal(false);
  readonly error = signal<string | null>(null);
  readonly isAuthenticated = computed(() => this.auth.isAuthenticated());
  readonly user = computed(() => this.me.value() ?? null);

  async signIn(email: string, password: string) {
    this.isLoading.set(true);
    this.error.set(null);
    try {
      const { data, error } = await this.authClient.signIn.email({ email, password });
      if (error || !data) throw new Error(error?.message ?? 'Sign in failed');

      await this.convex.refreshAuth();
      this.me.reload();
    } catch (e: any) {
      this.error.set(e?.message ?? 'Sign in failed');
      throw e;
    } finally {
      this.isLoading.set(false);
    }
  }

  async signUp(email: string, password: string, name: string) {
    this.isLoading.set(true);
    this.error.set(null);
    try {
      const { data, error } = await this.authClient.signUp.email({ email, password, name });
      if (error || !data) throw new Error(error?.message ?? 'Sign up failed');

      await this.convex.refreshAuth();
      this.me.reload();
    } catch (e: any) {
      this.error.set(e?.message ?? 'Sign up failed');
      throw e;
    } finally {
      this.isLoading.set(false);
    }
  }

  async signOut() {
    await this.authClient.signOut();
    this.convex.logoutLocal();
    this.me.reload();
    this.error.set(null);
  }
}
