'use client';

// Clears the session via /api/auth/logout, then redirects to the login entry.
export function LogoutButton({ className }: { className?: string }) {
  async function onClick() {
    const res = await fetch('/api/auth/logout', { method: 'POST' });
    const json = (await res.json().catch(() => ({}))) as { redirect?: string };
    window.location.assign(json.redirect ?? '/login');
  }
  return (
    <button type="button" onClick={onClick} className={className}>
      Log out
    </button>
  );
}
