import type { EmailMessage, EmailProvider } from './EmailProvider.js';
import { createLogger } from '../../config/logger.js';

const log = createLogger('email:console');

/**
 * Fallback that writes email to the log instead of sending it.
 *
 * Used when no SMTP server is configured. It logs the subject, recipient and the
 * plain-text body — the body matters, because verification and password-reset
 * links are the one thing a developer genuinely needs to read out of a dev inbox.
 */
export class ConsoleEmailProvider implements EmailProvider {
  readonly name = 'console';

  async send(message: EmailMessage) {
    log.info(
      { to: message.to, subject: message.subject, body: message.text },
      'Email (not sent — console provider)',
    );
    return { delivered: true, messageId: `console-${Date.now()}` };
  }

  async isHealthy(): Promise<boolean> {
    return true;
  }
}
