import type { Metadata } from 'next';
import { ListingsClient } from './ListingsClient';

export const metadata: Metadata = { title: 'Listings · Admin' };

export default function AdminListingsPage() {
  return <ListingsClient />;
}
