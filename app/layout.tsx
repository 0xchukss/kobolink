import './globals.css';
import { ClerkAppProvider } from './ClerkAppProvider.js';

export const metadata = {
  title: 'KoboLink',
  description: 'Autonomous tipping for Nigerian X creators.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang='en'>
      <body><ClerkAppProvider>{children}</ClerkAppProvider></body>
    </html>
  );
}
