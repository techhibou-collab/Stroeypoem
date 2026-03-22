import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Poetry Hub',
  description: 'Upload and read poetry collections',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
