// Shared form primitives for the auth pages — keeps the forms terse and visually
// consistent without a component library.

import type { InputHTMLAttributes, ReactNode } from 'react';

export function Field({
  label,
  ...props
}: { label: string } & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block font-medium text-gray-700">{label}</span>
      <input
        className="w-full rounded border border-gray-300 px-3 py-2 outline-none focus:border-gray-900"
        {...props}
      />
    </label>
  );
}

export function SubmitButton({ children, disabled }: { children: ReactNode; disabled?: boolean }) {
  return (
    <button
      type="submit"
      disabled={disabled}
      className="w-full rounded bg-gray-900 px-3 py-2 font-medium text-white disabled:opacity-50"
    >
      {children}
    </button>
  );
}

export function FormMessage({
  tone,
  children,
}: {
  tone: 'error' | 'success';
  children: ReactNode;
}) {
  const color = tone === 'error' ? 'text-red-600' : 'text-green-700';
  return <p className={`text-sm ${color}`}>{children}</p>;
}
