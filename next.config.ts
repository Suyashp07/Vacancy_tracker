import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Candidate documents are served from Supabase Storage via short-lived signed
  // URLs, so no remote image host is needed. Images are disabled by default here
  // to keep the surface area small until real branding exists.
  images: { unoptimized: true },
  experimental: {
    // Server actions are the only mutation path; raise the payload cap so that
    // resume/photograph uploads (max 10 MB per config) reach the action intact.
    serverActions: { bodySizeLimit: '12mb' },
  },
  async headers() {
    return [
      {
        // Defence-in-depth for an internal HR system holding personal data.
        source: '/:path*',
        headers: [
          { key: 'X-Robots-Tag', value: 'noindex, nofollow, noarchive' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'same-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },
    ];
  },
};

export default nextConfig;
