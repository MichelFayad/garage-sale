import type { Metadata } from 'next';
import { UsersClient } from './UsersClient';

export const metadata: Metadata = { title: 'Users · Admin' };

export default function AdminUsersPage() {
  return <UsersClient />;
}
