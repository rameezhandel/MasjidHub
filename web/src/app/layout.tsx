import type { Metadata } from 'next';
import { Geist } from 'next/font/google';
import { AuthProvider } from '@/lib/auth';
import './globals.css';

const geist = Geist({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: { default: 'MasjidHub', template: '%s · MasjidHub' },
  description: 'One platform for many masjids — prayer times, announcements, and events.',
};

// Applies the persisted (or system) theme before first paint, so there is no
// light-to-dark flash on load.
const themeScript = `(function(){try{var e=localStorage.getItem('mh.theme');var m=window.matchMedia('(prefers-color-scheme: dark)').matches;var d=e?e==='dark':m;var c=document.documentElement.classList;d?c.add('dark'):c.remove('dark');}catch(_){}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className={`${geist.className} min-h-screen bg-background text-foreground antialiased`}>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
