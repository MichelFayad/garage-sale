import type { Metadata } from 'next';
import { AuditClient } from './AuditClient';

export const metadata: Metadata = { title: 'Audit · Admin' };

export default function AdminAuditPage() {
  return <AuditClient />;
}
