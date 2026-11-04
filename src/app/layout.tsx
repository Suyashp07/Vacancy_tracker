import type { Metadata, Viewport } from 'next';
import { Suspense } from 'react';
import './globals.css';
import './ui-polish.css';
import { APP_NAME, APP_SUBTITLE } from '@/lib/constants';
import { TopLoader } from '@/components/top-loader';

export const metadata: Metadata = {
  title: { default: `${APP_NAME} | ${APP_SUBTITLE}`, template: `%s | ${APP_SUBTITLE}` },
  description: 'Internal vacancy and hiring workflow for Yash Honda dealerships.',
  robots: 'noindex, nofollow, noarchive',
};

export const viewport: Viewport = {
  themeColor: '#f4f4f1',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700&family=Instrument+Serif:ital@0;1&family=JetBrains+Mono:wght@400;500;600&display=swap"
        />
      </head>
      <body>
        <Suspense fallback={null}>
          <TopLoader />
        </Suspense>
        {children}
      </body>
    </html>
  );
}
