import { ChangeDetectionStrategy, Component, effect, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AuthStore } from '../../state/auth.store';
import { convexLiveResource, convexMutationResource } from 'convngx';
import { api } from '../../../convex/_generated/api';

@Component({
  selector: 'app-chat',
  imports: [CommonModule, FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './chat.component.html',
})
export class ChatComponent {
  protected readonly authStore = inject(AuthStore);

  protected sendMessageMutation = convexMutationResource(api.messages.sendMessage);

  readonly newMessage = signal('');
  readonly filter = signal('');
  protected filteredMessages = convexLiveResource(
    api.messages.getFilteredMessagesByContent,
    () => ({ content: this.filter() }),
  );

  protected async sendMessage() {
    const content = this.newMessage().trim();
    if (!content || this.sendMessageMutation.isRunning()) {
      return;
    }
    this.sendMessageMutation.run({ content });
    this.newMessage.set('');
  }

  protected onKeyPress(event: KeyboardEvent) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      this.sendMessage();
    }
  }

  protected formatTime(timestamp: number): string {
    return new Date(timestamp).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    });
  }
}
