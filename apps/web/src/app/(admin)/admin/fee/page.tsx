import type { Metadata } from 'next';
import { FeeClient } from './FeeClient';

export const metadata: Metadata = { title: 'Fee · Admin' };

export default function AdminFeePage() {
  return <FeeClient />;
}
