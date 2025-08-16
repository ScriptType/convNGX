import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AuthStore } from '../../state/auth.store';

@Component({
  selector: 'app-auth',
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './auth.component.html',
})
export class AuthComponent {
  protected readonly authStore = inject(AuthStore);
  protected readonly mode = signal<'login' | 'register'>('login');

  protected toggleMode() {
    this.mode.update((m) => (m === 'login' ? 'register' : 'login'));
  }

  protected signIn(email: string, password: string) {
    this.authStore.signIn(email, password);
  }
  protected signUp(email: string, password: string, name: string) {
    this.authStore.signUp(email, password, name);
  }
}
