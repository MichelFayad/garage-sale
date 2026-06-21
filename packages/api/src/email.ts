// Transactional email sender. P8 wires a real provider (Resend/SES); for now this
// logs the message and records an EmailLog row so auth flows are observable/testable.

import type { EmailType, PrismaClient } from '@garage-sale/db';

export interface OutboundEmail {
  type: EmailType;
  toEmail: string;
  userId?: string | null;
  subject: string;
  body: string;
}

export async function sendEmail(prisma: PrismaClient, email: OutboundEmail): Promise<void> {
  const providerMsgId = `stub_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  if (process.env.NODE_ENV !== 'production') {
    console.log(`[email:${email.type}] -> ${email.toEmail}\n  ${email.subject}\n  ${email.body}`);
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

/** Base URL for links in emails (verification, reset). */
export function appBaseUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
}
