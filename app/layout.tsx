import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  metadataBase: new URL('https://kobo-link.vercel.app'),
  title: 'KoboLink',
  description: 'Autonomous tipping for Nigerian X creators.',
  icons: {
    icon: '/icon.png',
    shortcut: '/favicon.png',
    apple: '/icon.png',
  },
  openGraph: {
    title: 'KoboLink',
    description: 'Autonomous tipping for Nigerian X creators.',
    url: 'https://kobo-link.vercel.app',
    siteName: 'KoboLink',
    images: [
      {
        url: '/og_image.png',
        width: 1200,
        height: 630,
        alt: 'KoboLink OG Image',
      },
    ],
    locale: 'en_NG',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'KoboLink',
    description: 'Autonomous tipping for Nigerian X creators.',
    images: ['/og_image.png'],
  },
};

import { Web3Provider } from './Web3Provider.js';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang='en'>
      <body>
        <Web3Provider>
          {children}
        </Web3Provider>
      </body>
    </html>
  );
}
