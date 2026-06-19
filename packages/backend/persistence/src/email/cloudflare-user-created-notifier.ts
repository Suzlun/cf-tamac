import { EmailMessage } from 'cloudflare:email';

import type { User, UserCreatedNotifier } from '@cfreact-template-backend/domain';
import type { Bindings } from '@cfreact-template-backend/types';

/** Configuration for Cloudflare user-created email notifications. */
export interface CloudflareUserCreatedNotifierOptions {
  from?: string;
  to?: string;
}

/** User-created notifier backed by Cloudflare Workers Email. */
export class CloudflareUserCreatedNotifier implements UserCreatedNotifier {
  constructor(
    private readonly emailBinding: Bindings['EMAIL'],
    private readonly options: CloudflareUserCreatedNotifierOptions
  ) {}

  async notifyUserCreated(user: User): Promise<void> {
    const from = this.options.from?.trim() ?? '';
    const to = this.options.to?.trim() ?? '';

    if (from === '' || to === '') {
      return;
    }

    const message = new EmailMessage(from, to, this.buildRawMessage(from, to, user));
    await this.emailBinding.send(message);
  }

  private buildRawMessage(from: string, to: string, user: User): string {
    return [
      `From: <${from}>`,
      `To: <${to}>`,
      'Subject: New user created in cfreact-template',
      'MIME-Version: 1.0',
      'Content-Type: text/plain; charset=utf-8',
      '',
      'A new user was created.',
      `id: ${String(user.id)}`,
      `name: ${user.name}`,
      `email: ${user.email}`,
      `createdAt: ${user.createdAt.toISOString()}`,
    ].join('\r\n');
  }
}
