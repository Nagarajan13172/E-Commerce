export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  /** Plain-text alternative. Always send one: some clients refuse HTML-only mail. */
  text: string;
  replyTo?: string;
}

/**
 * Transactional email abstraction.
 *
 * Two implementations ship: SMTP (Mailpit locally, any provider in production)
 * and a console logger for environments with no mail server at all.
 *
 * `send` never throws. A failed order-confirmation email must not fail the order
 * — the payment already succeeded and the stock is already committed. Delivery
 * problems are logged and reported through the return value so a caller can
 * decide to retry, but they can never roll back business state.
 */
export interface EmailProvider {
  send(message: EmailMessage): Promise<{ delivered: boolean; messageId?: string; error?: string }>;
  isHealthy(): Promise<boolean>;
  readonly name: string;
}
