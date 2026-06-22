import type { Metadata } from 'next';
import Link from 'next/link';
import { LoginForm } from './LoginForm';
import { OAuthButtons } from '../_components/OAuthButtons';
import { FormMessage } from '../_components/fields';

export const metadata: Metadata = { title: 'Log in' };

// Redirect/guard banners surfaced via query params: middleware sets ?blocked on a
// suspended/banned account; the OAuth callback sets ?error on a failed sign-in.
const BANNERS: Record<string, string> = {
  banned: 'This account has been banned.',
  suspended: 'This account is suspended. Contact support.',
  oauth: 'Social sign-in failed. Please try again.',
  oauth_state: 'Sign-in expired. Please try again.',
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; blocked?: string }>;
}) {
  const { error, blocked } = await searchParams;
  const banner = BANNERS[blocked ?? ''] ?? BANNERS[error ?? ''];

  return (
    <section className="mx-auto max-w-sm py-16">
      <h1 className="text-2xl font-semibold">Log in</h1>
      <p className="mt-1 text-sm text-gray-500">Welcome back to Garage Sale.</p>
      {banner && (
        <div className="mt-4">
          <FormMessage tone="error">{banner}</FormMessage>
        </div>
      )}
      <div className="mt-6">
        <LoginForm />
      </div>
      <div className="mt-3 flex justify-between text-sm">
        <Link href="/forgot-password" className="text-gray-600 hover:underline">
          Forgot password?
        </Link>
        <Link href="/register" className="text-gray-600 hover:underline">
          Create account
        </Link>
      </div>
      <div className="my-6 flex items-center gap-3 text-xs text-gray-500">
        <span className="h-px flex-1 bg-gray-200" />
        OR
        <span className="h-px flex-1 bg-gray-200" />
      </div>
      <OAuthButtons />
    </section>
  );
}
