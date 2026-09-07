import { env } from '../../../config/env.js';
import { escapeHtml, renderLayout } from './layout.js';
import type { EmailMessage } from '../EmailProvider.js';

/** Money in an email must match the invoice exactly — same formatting rules. */
function money(amount: number, currency = 'INR'): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency,
    maximumFractionDigits: 2,
    minimumFractionDigits: 0,
  }).format(amount);
}

export interface OrderEmailItem {
  name: string;
  quantity: number;
  lineTotal: number;
  options?: string;
}

function renderItems(items: OrderEmailItem[], currency: string): string {
  return items
    .map(
      (item) => `
        <tr>
          <td style="padding:8px 0;border-bottom:1px solid #e5e7eb;font-size:14px;">
            ${escapeHtml(item.name)}
            ${item.options ? `<br><span style="color:#6b7280;font-size:12px;">${escapeHtml(item.options)}</span>` : ''}
            <br><span style="color:#6b7280;font-size:12px;">Qty ${item.quantity}</span>
          </td>
          <td style="padding:8px 0;border-bottom:1px solid #e5e7eb;font-size:14px;text-align:right;white-space:nowrap;">
            ${money(item.lineTotal, currency)}
          </td>
        </tr>`,
    )
    .join('');
}

export function orderConfirmationTemplate(params: {
  to: string;
  name: string;
  orderNumber: string;
  items: OrderEmailItem[];
  total: number;
  currency: string;
  deliveryEstimate?: string;
}): EmailMessage {
  const url = `${env.CLIENT_URL}/account/orders/${params.orderNumber}`;

  return {
    to: params.to,
    subject: `Order ${params.orderNumber} confirmed`,
    html: renderLayout({
      title: 'Your order is confirmed',
      preheader: `${params.orderNumber} — ${money(params.total, params.currency)}`,
      body: `
        <p style="margin:0 0 12px;">Hi ${escapeHtml(params.name)},</p>
        <p style="margin:0 0 16px;">Thanks for your order. We are getting it ready${
          params.deliveryEstimate
            ? ` and expect it to arrive ${escapeHtml(params.deliveryEstimate)}`
            : ''
        }.</p>
        <p style="margin:0 0 8px;font-size:13px;color:#6b7280;">Order ${escapeHtml(params.orderNumber)}</p>
        <table style="width:100%;border-collapse:collapse;">
          ${renderItems(params.items, params.currency)}
          <tr>
            <td style="padding:12px 0;font-size:15px;font-weight:600;">Total</td>
            <td style="padding:12px 0;font-size:15px;font-weight:600;text-align:right;">
              ${money(params.total, params.currency)}
            </td>
          </tr>
        </table>`,
      cta: { label: 'Track your order', url },
    }),
    text: `Hi ${params.name},

Thanks for your order — ${params.orderNumber} is confirmed.

${params.items.map((i) => `  ${i.quantity} × ${i.name} — ${money(i.lineTotal, params.currency)}`).join('\n')}

  Total: ${money(params.total, params.currency)}

Track it here: ${url}`,
  };
}

export function orderShippedTemplate(params: {
  to: string;
  name: string;
  orderNumber: string;
  trackingNumber?: string;
  provider?: string;
}): EmailMessage {
  const url = `${env.CLIENT_URL}/account/orders/${params.orderNumber}`;

  return {
    to: params.to,
    subject: `Order ${params.orderNumber} is on its way`,
    html: renderLayout({
      title: 'Your order has shipped',
      preheader: `${params.orderNumber} is on its way`,
      body: `
        <p style="margin:0 0 12px;">Hi ${escapeHtml(params.name)},</p>
        <p style="margin:0;">Order <strong>${escapeHtml(params.orderNumber)}</strong> has left our warehouse.</p>
        ${
          params.trackingNumber
            ? `<p style="margin:12px 0 0;font-size:14px;">Tracking number: <strong>${escapeHtml(params.trackingNumber)}</strong>${
                params.provider ? ` (${escapeHtml(params.provider)})` : ''
              }</p>`
            : ''
        }`,
      cta: { label: 'Track your order', url },
    }),
    text: `Hi ${params.name},

Order ${params.orderNumber} has shipped.${
      params.trackingNumber ? `\nTracking: ${params.trackingNumber}` : ''
    }

Track it here: ${url}`,
  };
}

export function orderCancelledTemplate(params: {
  to: string;
  name: string;
  orderNumber: string;
  reason: string;
  refundAmount?: number;
  currency?: string;
}): EmailMessage {
  return {
    to: params.to,
    subject: `Order ${params.orderNumber} cancelled`,
    html: renderLayout({
      title: 'Your order has been cancelled',
      body: `
        <p style="margin:0 0 12px;">Hi ${escapeHtml(params.name)},</p>
        <p style="margin:0 0 12px;">Order <strong>${escapeHtml(params.orderNumber)}</strong> has been cancelled.</p>
        <p style="margin:0;font-size:14px;color:#6b7280;">Reason: ${escapeHtml(params.reason)}</p>
        ${
          params.refundAmount
            ? `<p style="margin:12px 0 0;">A refund of <strong>${money(
                params.refundAmount,
                params.currency,
              )}</strong> is on its way to your original payment method. It usually takes 5–7 working days to appear.</p>`
            : ''
        }`,
      cta: { label: 'Browse products', url: `${env.CLIENT_URL}/products` },
    }),
    text: `Hi ${params.name},

Order ${params.orderNumber} has been cancelled.
Reason: ${params.reason}${
      params.refundAmount
        ? `\n\nA refund of ${money(params.refundAmount, params.currency)} is on its way and usually takes 5–7 working days.`
        : ''
    }`,
  };
}
