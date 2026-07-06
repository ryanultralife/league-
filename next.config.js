/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Web Bluetooth + MediaDevices require a secure context. Vercel serves HTTPS
  // by default; these headers add the permissions policy the APIs need and
  // upgrade any accidental http subresource requests.
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'Permissions-Policy',
            value: 'bluetooth=(self), camera=(self), microphone=(self)',
          },
          {
            key: 'Content-Security-Policy',
            value: 'upgrade-insecure-requests',
          },
        ],
      },
      {
        // Never cache the service worker so clients pick up new versions.
        source: '/sw.js',
        headers: [{ key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' }],
      },
    ];
  },
};

module.exports = nextConfig;
