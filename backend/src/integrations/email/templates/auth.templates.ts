import { env } from '../../../config/env.js';
import { AUTH_LIMITS } from '@ecom/shared';
import { escapeHtml, renderLayout } from './layout.js';
import type { EmailMessage } from '../EmailProvider.js';

/**
 * Auth email templates.
 *
 * Each returns both HTML and a plain-text alternative. The text version is not
 * an afterthought: it is what the console provider logs in development, and what
 * accessibility tooling and text-only clients actually read.
 */

export function verifyEmailTemplate(params: {
  to: string;
  name: string;
  token: string;
}): EmailMessage {
  const url = `${env.CLIENT_URL}/verify-email?token=${encodeURIComponent(params.token)}`;
  const hours = AUTH_LIMITS.VERIFY_TOKEN_TTL_HOURS;

  return {
    to: params.to,
    subject: 'Confirm your email address',
    html: renderLayout({
      title: 'Confirm your email address',
      preheader: 'One click and your Aurora account is ready.',
      body: `<p style="margin:0 0 12px;">Hi ${escapeHtml(params.name)},</p>
             <p style="margin:0;">Thanks for creating an Aurora account. Confirm this address to secure your account and start ordering.</p>`,
      cta: { label: 'Confirm email address', url },
      footerNote: `This link expires in ${hours} hours. If you did not create an account, you can safely ignore this email.`,
    }),
    text: `Hi ${params.name},

Thanks for creating an Aurora account. Confirm your email address to get started:

${url}

This link expires in ${hours} hours. If you did not create an account, ignore this email.`,
  };
}

export function passwordResetTemplate(params: {
  to: string;
  name: string;
  token: string;
}): EmailMessage {
  const url = `${env.CLIENT_URL}/reset-password?token=${encodeURIComponent(params.token)}`;
  const minutes = AUTH_LIMITS.RESET_TOKEN_TTL_MINUTES;

  return {
    to: params.to,
    subject: 'Reset your password',
    html: renderLayout({
      title: 'Reset your password',
      preheader: 'A link to choose a new password.',
      body: `<p style="margin:0 0 12px;">Hi ${escapeHtml(params.name)},</p>
             <p style="margin:0;">We received a request to reset the password for your Aurora account. Choose a new one using the button below.</p>`,
      cta: { label: 'Choose a new password', url },
      footerNote: `This link expires in ${minutes} minutes and can be used once. If you did not request a reset, no action is needed — your password has not changed.`,
    }),
    text: `Hi ${params.name},

We received a request to reset your Aurora password. Choose a new one here:

${url}

This link expires in ${minutes} minutes and can only be used once.
If you did not request this, your password has not changed and no action is needed.`,
  };
}

/**
 * Sent after a successful password change.
 *
 * This is a security control, not a courtesy: it is how a user finds out that
 * someone else changed their password, and it is often the only signal they get.
 */
export function passwordChangedTemplate(params: { to: string; name: string }): EmailMessage {
  return {
    to: params.to,
    subject: 'Your password was changed',
    html: renderLayout({
      title: 'Your password was changed',
      body: `<p style="margin:0 0 12px;">Hi ${escapeHtml(params.name)},</p>
             <p style="margin:0 0 12px;">The password for your Aurora account was just changed, and you have been signed out on all devices.</p>
             <p style="margin:0;"><strong>If this was not you</strong>, reset your password immediately and contact support.</p>`,
      cta: { label: 'Reset your password', url: `${env.CLIENT_URL}/forgot-password` },
    }),
    text: `Hi ${params.name},

The password for your Aurora account was just changed, and you have been signed out on all devices.

If this was not you, reset your password immediately: ${env.CLIENT_URL}/forgot-password`,
  };
}

export function welcomeTemplate(params: { to: string; name: string }): EmailMessage {
  return {
    to: params.to,
    subject: 'Welcome to Aurora',
    html: renderLayout({
      title: `Welcome, ${escapeHtml(params.name)}`,
      preheader: 'Your account is ready.',
      body: `<p style="margin:0 0 12px;">Your email is confirmed and your Aurora account is ready to use.</p>
             <p style="margin:0;">Browse electronics, fashion, home and beauty — and track every order from your account.</p>`,
      cta: { label: 'Start shopping', url: `${env.CLIENT_URL}/products` },
    }),
    text: `Welcome, ${params.name}.

Your email is confirmed and your Aurora account is ready.

Start shopping: ${env.CLIENT_URL}/products`,
  };
}
