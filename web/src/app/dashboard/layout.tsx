'use client';

import { clsx } from 'clsx';
import { MenuIcon } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Logo } from '@/components/Logo';
import { ThemeToggle } from '@/components/ThemeToggle';
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from '@/components/ui';
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

  // Close the mobile drawer whenever the route changes.
  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  if (loading || !user) {
    return <div className="p-10 text-center text-sm text-muted-foreground">Loading…</div>;
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
              ? 'bg-accent text-accent-foreground'
              : 'text-muted-foreground hover:bg-secondary',
          )}
        >
          {link.label}
        </Link>
      ))}
    </nav>
  );

  const accountFooter = (
    <div className="border-t border-border pt-3 text-xs text-muted-foreground">
      <p className="truncate font-medium text-foreground">
        {user.firstName} {user.lastName}
      </p>
      <p className="truncate">{user.email}</p>
      <div className="mt-2 flex items-center justify-between gap-2">
        <button onClick={signOut} className="text-destructive underline">
          Sign out
        </button>
        <ThemeToggle />
      </div>
    </div>
  );

  return (
    <div className="flex min-h-screen">
      {/* Desktop sidebar */}
      <aside className="hidden w-56 shrink-0 flex-col border-r border-border bg-card p-4 sm:flex">
        <Link href="/dashboard" className="mb-2 px-2">
          <Logo />
        </Link>
        {user.role === 'PLATFORM_ADMIN' && (
          <span className="mb-4 ml-2 w-fit rounded-sm bg-gold/15 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-widest text-gold">
            Platform
          </span>
        )}
        <div className="mt-2 flex-1">{navLinks}</div>
        {accountFooter}
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile top bar with a Sheet-backed drawer. Hamburger and drawer are
            both on the left so the menu opens from the side it's triggered on. */}
        <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-border bg-card px-4 py-3 sm:hidden">
          <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
            <SheetTrigger
              aria-label="Open menu"
              className="rounded-lg border border-border p-2 text-muted-foreground"
            >
              <MenuIcon className="size-5" />
            </SheetTrigger>
            <SheetContent side="left" className="w-72">
              <SheetTitle className="px-2">
                <Logo />
              </SheetTitle>
              <div className="flex-1">{navLinks}</div>
              {accountFooter}
            </SheetContent>
          </Sheet>
          <Link href="/dashboard">
            <Logo markClassName="size-6" className="[&>span]:text-base" />
          </Link>
        </header>

        <main className="min-w-0 flex-1 p-4 sm:p-8">{children}</main>
      </div>
    </div>
  );
}
