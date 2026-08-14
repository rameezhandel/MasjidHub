import type { Metadata } from 'next';
import { GlobalProgress } from '@/components/GlobalProgress';
import { Toaster } from '@/components/ui/toast';
import { AuthProvider } from '@/lib/auth';
import './globals.css';

export const metadata: Metadata = {
  title: { default: 'MasjidHub', template: '%s · MasjidHub' },
  description: 'One platform for many masjids — prayer times, announcements, and events.',
};

// Applies the persisted (or system) theme and the persisted language before
// first paint, so there is no light-to-dark (or lang) flash on load.
const themeScript = `(function(){try{var e=localStorage.getItem('mh.theme');var m=window.matchMedia('(prefers-color-scheme: dark)').matches;var d=e?e==='dark':m;var c=document.documentElement.classList;d?c.add('dark'):c.remove('dark');var l=localStorage.getItem('mh.lang');if(l==='hi'||l==='kn')document.documentElement.lang=l;}catch(_){}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* The Latin faces are needed for first paint; the -ext files load on
            demand via their unicode-range. */}
        <link
          rel="preload"
          href="/fonts/plus-jakarta-sans-latin.woff2"
          as="font"
          type="font/woff2"
          crossOrigin="anonymous"
        />
        <link
          rel="preload"
          href="/fonts/sora-latin.woff2"
          as="font"
          type="font/woff2"
          crossOrigin="anonymous"
        />
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-screen bg-background text-foreground antialiased">
        <GlobalProgress />
        <AuthProvider>{children}</AuthProvider>
        <Toaster />
      </body>
    </html>
  );
}
