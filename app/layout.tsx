import './globals.css';
import { ClerkAppProvider } from './ClerkAppProvider.js';

import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'KoboLink',
  description: 'Autonomous tipping for Nigerian X creators.',
  openGraph: {
    title: 'KoboLink',
    description: 'Autonomous tipping for Nigerian X creators.',
    url: 'https://kobo-link.vercel.app',
    siteName: 'KoboLink',
    locale: 'en_NG',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'KoboLink',
    description: 'Autonomous tipping for Nigerian X creators.',
  },
};

import { Web3Provider } from './Web3Provider.js';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang='en'>
      <body>
        <a href="#main-content" className="skip-link">Skip to main content</a>
        <Web3Provider>
          <ClerkAppProvider>{children}</ClerkAppProvider>
        </Web3Provider>
      </body>
    </html>
  );
}
