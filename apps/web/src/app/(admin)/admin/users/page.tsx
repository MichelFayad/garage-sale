import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Users · Admin' };

export default function AdminUsersPage() {
  return (
    <section className="py-8">
      <h1 className="text-2xl font-semibold">Users</h1>
      <p className="mt-2 text-gray-600">
        Search, suspend/ban, and review trader accounts. Lands P9.
      </p>
    </section>
  );
}
