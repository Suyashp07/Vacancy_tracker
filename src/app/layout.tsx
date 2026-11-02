import type { Metadata, Viewport } from 'next';
import './globals.css';
import { APP_NAME, APP_SUBTITLE } from '@/lib/constants';

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
        {/*
          Loaded from the CDN at runtime rather than through next/font at build
          time: a build machine without outbound access would fail, and none of
          these faces is required for the page to be readable - the token stack
          falls back to system faces. Plus Jakarta Sans is the UI voice,
          Instrument Serif the display accent, JetBrains Mono the tabular numbers.
        */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700&family=Instrument+Serif:ital@0;1&family=JetBrains+Mono:wght@400;500;600&display=swap"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
