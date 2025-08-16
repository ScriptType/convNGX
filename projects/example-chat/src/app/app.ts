import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { AuthStore } from './state/auth.store';
import { ChatComponent } from './components/chat/chat.component';
import { AuthComponent } from './components/auth/auth.component';

@Component({
  selector: 'app-root',
  imports: [ChatComponent, AuthComponent],
  templateUrl: './app.html',
  styleUrl: './app.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class App {
  // Live messages
  protected readonly authStore = inject(AuthStore);

  ngOnInit() {
    // Service initialization is handled in the service constructor
  }

  protected signOut() {
    this.authStore.signOut();
  }
}
