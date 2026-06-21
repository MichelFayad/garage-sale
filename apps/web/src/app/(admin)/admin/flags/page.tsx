import type { Metadata } from 'next';
import { FlagsClient } from './FlagsClient';

export const metadata: Metadata = { title: 'Flags · Admin' };

export default function AdminFlagsPage() {
  return <FlagsClient />;
}
