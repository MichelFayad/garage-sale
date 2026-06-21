import type { Metadata } from 'next';
import { ReportsClient } from './ReportsClient';

export const metadata: Metadata = { title: 'Reports · Admin' };

export default function AdminReportsPage() {
  return <ReportsClient />;
}
