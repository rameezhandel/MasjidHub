import Link from 'next/link';

export default function LandingPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col items-center justify-center px-6 text-center">
      <p className="mb-3 text-4xl">🕌</p>
      <h1 className="text-4xl font-bold tracking-tight text-slate-900">MasjidHub</h1>
      <p className="mt-4 max-w-xl text-lg text-slate-600">
        One platform for many masjids. Accurate prayer times, announcements, and events for your
        community — managed by your masjid&apos;s own team.
      </p>
      <div className="mt-8 flex gap-3">
        <Link
          href="/login"
          className="rounded-lg bg-emerald-700 px-5 py-2.5 text-sm font-medium text-white hover:bg-emerald-800"
        >
          Staff sign in
        </Link>
      </div>
      <p className="mt-10 text-sm text-slate-400">
        Looking for your masjid? Its public page lives at{' '}
        <code className="rounded bg-slate-100 px-1.5 py-0.5">/m/&lt;masjid-slug&gt;</code>
      </p>
    </main>
  );
}
