import { env, isTest } from '../../config/env.js';
import { createLogger } from '../../config/logger.js';
import type { EmailProvider } from './EmailProvider.js';
import { ConsoleEmailProvider } from './console.provider.js';
import { SmtpEmailProvider } from './smtp.provider.js';
import { MemoryEmailProvider } from './memory.provider.js';

const log = createLogger('email');

function createEmailProvider(): EmailProvider {
  // Tests must never open an SMTP socket, and they need to assert on what was
  // sent — so the in-memory recorder is chosen before anything else.
  if (isTest) return new MemoryEmailProvider();

  if (env.EMAIL_PROVIDER === 'smtp') {
    log.info({ host: env.SMTP_HOST, port: env.SMTP_PORT }, 'Using SMTP email provider');
    return new SmtpEmailProvider();
  }

  log.info('Using console email provider \u2014 messages are logged, not sent');
  return new ConsoleEmailProvider();
}

export const emailProvider: EmailProvider = createEmailProvider();

/**
 * Typed handle for tests. Returns undefined outside the test environment, so
 * production code cannot accidentally depend on the recorder.
 */
export function getTestEmailProvider(): MemoryEmailProvider | undefined {
  return emailProvider instanceof MemoryEmailProvider ? emailProvider : undefined;
}

export type { EmailMessage, EmailProvider } from './EmailProvider.js';
export { MemoryEmailProvider } from './memory.provider.js';
