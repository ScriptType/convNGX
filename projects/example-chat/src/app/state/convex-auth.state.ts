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