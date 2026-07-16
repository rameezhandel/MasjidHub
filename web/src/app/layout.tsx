import type { Metadata } from 'next';
import { Geist } from 'next/font/google';
import { AuthProvider } from '@/lib/auth';
import './globals.css';

const geist = Geist({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: { default: 'MasjidHub', template: '%s · MasjidHub' },
  description: 'One platform for many masjids — prayer times, announcements, and events.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${geist.className} min-h-screen bg-slate-50 text-slate-900 antialiased`}>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
