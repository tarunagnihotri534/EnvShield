import type { Metadata } from 'next';
import localFont from 'next/font/local';
import { Sidebar } from '@/components/Sidebar';
import './globals.css';

const hubotSans = localFont({
  src: '../../HubotSans-VariableFont_wdth,wght.ttf',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'EnvShield',
  description: 'Secret detection for your git repositories — fully offline',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`dark ${hubotSans.className}`}>
      <body className="flex h-screen overflow-hidden bg-zinc-950 text-zinc-100 antialiased">
        <Sidebar />
        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      </body>
    </html>
  );
}
