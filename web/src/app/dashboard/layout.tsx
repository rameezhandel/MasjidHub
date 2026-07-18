'use client';

import { clsx } from 'clsx';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth';

const STAFF_LINKS = [
  { href: '/dashboard', label: 'Overview' },
  { href: '/dashboard/prayer-times', label: 'Prayer times' },
  { href: '/dashboard/announcements', label: 'Announcements' },
  { href: '/dashboard/events', label: 'Events' },
  { href: '/dashboard/households', label: 'Households' },
  { href: '/dashboard/members', label: 'Members' },
  { href: '/dashboard/staff', label: 'Staff' },
  { href: '/dashboard/settings', label: 'Masjid settings' },
  { href: '/dashboard/account', label: 'Account' },
];

const PLATFORM_LINKS = [
  { href: '/dashboard', label: 'Overview' },
  { href: '/dashboard/platform', label: 'Masjids' },
  { href: '/dashboard/platform/audit', label: 'Audit log' },
  { href: '/dashboard/account', label: 'Account' },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, loading, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (!loading && !user) router.replace('/login');
  }, [loading, user, router]);

  // Close the mobile menu whenever the route changes.
  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  if (loading || !user) {
    return <div className="p-10 text-center text-sm text-slate-400">Loading…</div>;
  }

  const links = user.role === 'PLATFORM_ADMIN' ? PLATFORM_LINKS : STAFF_LINKS;

  const signOut = async () => {
    await logout();
    router.replace('/login');
  };

  const navLinks = (
    <nav className="flex flex-col gap-1">
      {links.map((link) => (
        <Link
          key={link.href}
          href={link.href}
          className={clsx(
            'rounded-lg px-3 py-2 text-sm font-medium',
            pathname === link.href
              ? 'bg-emerald-50 text-emerald-800'
              : 'text-slate-600 hover:bg-slate-50',
          )}
        >
          {link.label}
        </Link>
      ))}
    </nav>
  );

  const accountFooter = (
    <div className="border-t border-slate-100 pt-3 text-xs text-slate-500">
      <p className="truncate font-medium text-slate-700">
        {user.firstName} {user.lastName}
      </p>
      <p className="truncate">{user.email}</p>
      <button onClick={signOut} className="mt-2 text-red-600 underline">
        Sign out
      </button>
    </div>
  );

  return (
    <div className="flex min-h-screen">
      {/* Desktop sidebar */}
      <aside className="hidden w-56 shrink-0 flex-col border-r border-slate-200 bg-white p-4 sm:flex">
        <Link href="/" className="mb-6 px-2 text-lg font-bold">
          🕌 MasjidHub
        </Link>
        <div className="flex-1">{navLinks}</div>
        {accountFooter}
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile top bar */}
        <header className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3 sm:hidden">
          <Link href="/" className="text-lg font-bold">
            🕌 MasjidHub
          </Link>
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            aria-label="Toggle menu"
            aria-expanded={menuOpen}
            className="rounded-lg border border-slate-200 p-2 text-slate-600"
          >
            {menuOpen ? (
              <span className="block h-5 w-5 text-center leading-5">✕</span>
            ) : (
              <span className="block h-5 w-5 space-y-1 py-1">
                <span className="block h-0.5 w-full bg-slate-600" />
                <span className="block h-0.5 w-full bg-slate-600" />
                <span className="block h-0.5 w-full bg-slate-600" />
              </span>
            )}
          </button>
        </header>

        {/* Mobile slide-down menu */}
        {menuOpen && (
          <div className="border-b border-slate-200 bg-white px-4 py-3 sm:hidden">
            {navLinks}
            <div className="mt-3">{accountFooter}</div>
          </div>
        )}

        <main className="min-w-0 flex-1 p-4 sm:p-8">{children}</main>
      </div>
    </div>
  );
}
