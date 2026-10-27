import type { Metadata, Viewport } from 'next';
import { DM_Sans, Source_Serif_4 } from 'next/font/google';
import './globals.css';
import './home.css';
import './dialogs.css';

// Self-hosted at build time; a CSS @import of Google Fonts is dropped from the production bundle.
const sans = DM_Sans({ subsets: ['latin'], variable: '--font-sans', display: 'swap' });
const serif = Source_Serif_4({ subsets: ['latin'], axes: ['opsz'], variable: '--font-serif', display: 'swap' });

export const metadata: Metadata = {
  title: 'AMCC | Agri Loan Tracker',
  description: 'A shared workspace for agricultural loan sourcing and renewals across thirteen branches.',
  manifest: '/manifest.webmanifest',
  appleWebApp: { capable: true, title: 'AMCC Loans', statusBarStyle: 'default' },
  // Next only emits the unprefixed tag; older iOS needs this one to open the home-screen app full screen.
  other: { 'apple-mobile-web-app-capable': 'yes' },
  icons: {
    icon: '/favicon.svg',
    apple: '/icon-192.png',
  },
};

// Draw edge to edge so the home landscape reaches under the phone's home indicator and gesture bar.
export const viewport: Viewport = { viewportFit: 'cover' };

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${sans.variable} ${serif.variable}`}>
      <body className="antialiased">{children}</body>
    </html>
  );
}
