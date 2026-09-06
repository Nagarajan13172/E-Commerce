import { env } from '../../../config/env.js';

/**
 * Shared HTML shell for transactional email.
 *
 * Email clients are a hostile rendering target: Outlook uses Word's engine,
 * Gmail strips <style> blocks in some contexts, and none support modern CSS
 * reliably. So this is a table-free but deliberately conservative layout using
 * inline styles only — no external stylesheets, no flexbox, no CSS variables.
 */
export interface LayoutOptions {
  title: string;
  preheader?: string;
  body: string;
  cta?: { label: string; url: string };
  footerNote?: string;
}

const BRAND = 'Aurora';
const ACCENT = '#4338ca';
const TEXT = '#1e1b2e';
const MUTED = '#6b7280';
const BORDER = '#e5e7eb';

export function renderLayout({ title, preheader, body, cta, footerNote }: LayoutOptions): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(title)}</title>
</head>
<body style="margin:0;padding:0;background:#f5f5f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:${TEXT};">
  ${
    preheader
      ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(preheader)}</div>`
      : ''
  }
  <div style="max-width:560px;margin:0 auto;padding:32px 16px;">
    <div style="padding:0 0 20px;">
      <span style="font-size:20px;font-weight:700;letter-spacing:-0.02em;color:${ACCENT};">${BRAND}</span>
    </div>

    <div style="background:#ffffff;border:1px solid ${BORDER};border-radius:12px;padding:32px;">
      <h1 style="margin:0 0 16px;font-size:20px;line-height:1.3;font-weight:600;color:${TEXT};">${escapeHtml(title)}</h1>
      <div style="font-size:15px;line-height:1.6;color:${TEXT};">${body}</div>
      ${
        cta
          ? `<div style="margin:28px 0 8px;">
               <a href="${cta.url}" style="display:inline-block;background:${ACCENT};color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:8px;font-size:15px;font-weight:600;">${escapeHtml(cta.label)}</a>
             </div>
             <p style="margin:16px 0 0;font-size:13px;line-height:1.5;color:${MUTED};">
               If the button does not work, copy this link into your browser:<br>
               <span style="word-break:break-all;color:${ACCENT};">${cta.url}</span>
             </p>`
          : ''
      }
      ${footerNote ? `<p style="margin:24px 0 0;font-size:13px;line-height:1.5;color:${MUTED};">${footerNote}</p>` : ''}
    </div>

    <p style="margin:20px 0 0;font-size:12px;line-height:1.5;color:${MUTED};text-align:center;">
      Sent by ${BRAND}. Questions? Reply to this email.<br>
      <a href="${env.CLIENT_URL}" style="color:${MUTED};">${env.CLIENT_URL}</a>
    </p>
  </div>
</body>
</html>`;
}

/**
 * Escape user-controlled values before interpolating them into email HTML.
 *
 * A customer's name goes into these templates; without escaping, a name
 * containing markup would be injected into every copy of that email.
 */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
