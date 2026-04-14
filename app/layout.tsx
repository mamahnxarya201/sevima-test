import type { Metadata } from 'next';
import './globals.css';
import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import '@fontsource/manrope/400.css';
import '@fontsource/manrope/600.css';
import '@fontsource/manrope/700.css';
import '@fontsource/manrope/800.css';
import '@fontsource/material-symbols-outlined';
import '@fontsource/roboto-mono/400.css';
import '@fontsource/roboto-mono/500.css';

export const metadata: Metadata = {
  title: 'DAG Workflow Engine',
  description: 'Multi-tenant Docker-orchestrated workflow execution engine',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
