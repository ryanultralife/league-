import type { Metadata, Viewport } from 'next';
import './globals.css';
import { PwaRegister } from '@/components/PwaRegister';

export const metadata: Metadata = {
  title: 'Diamond Overlay — Live Baseball Broadcast',
  description:
    'Multi-device live-streaming baseball overlay system with Web Bluetooth radar intake, computer-vision scoreboard reading, and real-time sync.',
  manifest: '/manifest.json',
  applicationName: 'Diamond Overlay',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Diamond Overlay',
  },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: '#06080f',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <PwaRegister />
        {children}
      </body>
    </html>
  );
}
