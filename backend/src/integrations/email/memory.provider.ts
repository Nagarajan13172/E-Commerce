import type { EmailMessage, EmailProvider } from './EmailProvider.js';

/**
 * Test double that records messages instead of sending them.
 *
 * This exists so tests can assert on outbound mail — that a reset email was
 * sent, that it went to the right address, and (crucially) what the one-time
 * token in it was. Tokens are stored hashed, so the email body is the only
 * place the plaintext still exists, exactly as it is for a real user.
 *
 * Selected automatically when NODE_ENV=test; never reachable in production.
 */
export class MemoryEmailProvider implements EmailProvider {
  readonly name = 'memory';
  readonly sent: EmailMessage[] = [];

  async send(message: EmailMessage) {
    this.sent.push(message);
    return { delivered: true, messageId: `memory-${this.sent.length}` };
  }

  async isHealthy(): Promise<boolean> {
    return true;
  }

  /** Most recent message sent to an address, optionally filtered by subject. */
  lastTo(email: string, subjectContains?: string): EmailMessage | undefined {
    return [...this.sent]
      .reverse()
      .find(
        (m) =>
          m.to === email &&
          (!subjectContains || m.subject.toLowerCase().includes(subjectContains.toLowerCase())),
      );
  }

  /**
   * Pull the one-time token out of the link in an email — the same thing a user
   * does by clicking it.
   */
  tokenFrom(message: EmailMessage): string | undefined {
    return /[?&]token=([A-Za-z0-9_-]+)/.exec(message.text)?.[1];
  }

  clear(): void {
    this.sent.length = 0;
  }
}
