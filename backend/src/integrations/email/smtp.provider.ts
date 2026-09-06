import nodemailer, { type Transporter } from 'nodemailer';
import type { EmailMessage, EmailProvider } from './EmailProvider.js';
import { env } from '../../config/env.js';
import { createLogger } from '../../config/logger.js';

const log = createLogger('email:smtp');

/**
 * SMTP delivery via nodemailer.
 *
 * Points at Mailpit in development (which accepts anything and shows it at
 * :8025) and at a real provider in production — the code path is identical, so
 * templates and delivery behaviour are exercised locally exactly as they will
 * run in production.
 */
export class SmtpEmailProvider implements EmailProvider {
  readonly name = 'smtp';
  private readonly transporter: Transporter;

  constructor() {
    this.transporter = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_SECURE,
      ...(env.SMTP_USER ? { auth: { user: env.SMTP_USER, pass: env.SMTP_PASS ?? '' } } : {}),
      // Reuse one connection across a burst of mail rather than reconnecting.
      pool: true,
      maxConnections: 3,
      connectionTimeout: 10_000,
    });
  }

  async send(message: EmailMessage) {
    try {
      const info = await this.transporter.sendMail({
        from: env.EMAIL_FROM,
        to: message.to,
        subject: message.subject,
        text: message.text,
        html: message.html,
        replyTo: message.replyTo,
      });
      log.debug({ to: message.to, subject: message.subject }, 'Email sent');
      return { delivered: true, messageId: info.messageId };
    } catch (err) {
      // Swallowed deliberately — see the note on EmailProvider.send. A dead
      // mail server must never turn a paid order into a failed request.
      log.error({ err, to: message.to, subject: message.subject }, 'Email delivery failed');
      return { delivered: false, error: err instanceof Error ? err.message : 'Unknown error' };
    }
  }

  async isHealthy(): Promise<boolean> {
    try {
      await this.transporter.verify();
      return true;
    } catch {
      return false;
    }
  }
}
