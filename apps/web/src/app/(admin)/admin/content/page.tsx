import type { Metadata } from 'next';
import { ContentClient } from './ContentClient';

export const metadata: Metadata = { title: 'Content · Admin' };

export default function AdminContentPage() {
  return <ContentClient />;
}
