'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { clsx } from 'clsx';
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

  useEffect(() => {
    if (!loading && !user) router.replace('/login');
  }, [loading, user, router]);

  if (loading || !user) {
    return <div className="p-10 text-center text-sm text-slate-400">Loading…</div>;
  }

  const links = user.role === 'PLATFORM_ADMIN' ? PLATFORM_LINKS : STAFF_LINKS;

  return (
    <div className="flex min-h-screen">
      <aside className="hidden w-56 shrink-0 flex-col border-r border-slate-200 bg-white p-4 sm:flex">
        <Link href="/" className="mb-6 px-2 text-lg font-bold">
          🕌 MasjidHub
        </Link>
        <nav className="flex flex-1 flex-col gap-1">
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
        <div className="border-t border-slate-100 pt-3 text-xs text-slate-500">
          <p className="truncate font-medium text-slate-700">
            {user.firstName} {user.lastName}
          </p>
          <p className="truncate">{user.email}</p>
          <button
            onClick={async () => {
              await logout();
              router.replace('/login');
            }}
            className="mt-2 text-red-600 underline"
          >
            Sign out
          </button>
        </div>
      </aside>
      <main className="flex-1 p-6 sm:p-8">{children}</main>
    </div>
  );
}
