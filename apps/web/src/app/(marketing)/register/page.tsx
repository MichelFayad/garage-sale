import type { Metadata } from 'next';
import Link from 'next/link';
import { RegisterForm } from './RegisterForm';
import { OAuthButtons } from '../_components/OAuthButtons';

export const metadata: Metadata = { title: 'Create account' };

export default function RegisterPage() {
  return (
    <section className="mx-auto max-w-sm py-16">
      <h1 className="text-2xl font-semibold">Create your account</h1>
      <p className="mt-1 text-sm text-gray-500">Start swapping with neighbours.</p>
      <div className="mt-6">
        <RegisterForm />
      </div>
      <p className="mt-3 text-sm text-gray-600">
        Already have an account?{' '}
        <Link href="/login" className="hover:underline">
          Log in
        </Link>
      </p>
      <div className="my-6 flex items-center gap-3 text-xs text-gray-400">
        <span className="h-px flex-1 bg-gray-200" />
        OR
        <span className="h-px flex-1 bg-gray-200" />
      </div>
      <OAuthButtons />
    </section>
  );
}
