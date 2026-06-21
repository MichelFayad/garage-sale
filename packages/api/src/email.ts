// Transactional email. Sends via Resend when configured (RESEND_API_KEY +
// EMAIL_PROVIDER=resend), otherwise logs (dev). Every send records an EmailLog
// row so flows stay observable/testable. A provider failure is swallowed (the
// triggering action must not fail because an email bounced) but still logged.

import type { EmailType, PrismaClient } from '@garage-sale/db';

export interface OutboundEmail {
  type: EmailType;
  toEmail: string;
  userId?: string | null;
  subject: string;
  body: string;
}

function emailFrom(): string {
  return process.env.EMAIL_FROM ?? 'Garage Sale <no-reply@garagesale.example>';
}

/** Send via Resend's HTTP API. Returns the provider message id. */
async function sendViaResend(email: OutboundEmail, apiKey: string): Promise<string> {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      from: emailFrom(),
      to: email.toEmail,
      subject: email.subject,
      text: email.body,
    }),
  });
  if (!res.ok) {
    throw new Error(`Resend ${res.status}: ${await res.text()}`);
  }
  const json = (await res.json()) as { id?: string };
  return json.id ?? `resend_${Date.now()}`;
}

export async function sendEmail(prisma: PrismaClient, email: OutboundEmail): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const useResend = process.env.EMAIL_PROVIDER === 'resend' && !!apiKey;

  let providerMsgId = `stub_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  try {
    if (useResend) {
      providerMsgId = await sendViaResend(email, apiKey);
    } else if (process.env.NODE_ENV !== 'production') {
      console.log(`[email:${email.type}] -> ${email.toEmail}\n  ${email.subject}\n  ${email.body}`);
    }
  } catch (err) {
    // Don't let a delivery failure break the triggering mutation.
    console.error(`[email:${email.type}] send failed:`, err);
    providerMsgId = `failed_${Date.now()}`;
  }

  await prisma.emailLog.create({
    data: {
      userId: email.userId ?? null,
      type: email.type,
      toEmail: email.toEmail,
      providerMsgId,
    },
  });
}

/** Base URL for links in emails (verification, reset, deep links). */
export function appBaseUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
}
