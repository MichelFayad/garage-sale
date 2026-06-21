import type { Metadata } from 'next';
import { TradesClient } from './TradesClient';

export const metadata: Metadata = { title: 'Trades · Admin' };

export default function AdminTradesPage() {
  return <TradesClient />;
}
