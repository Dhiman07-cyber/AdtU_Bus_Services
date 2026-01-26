import './globals.css';
import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { AuthProvider } from '@/contexts/auth-context';
import { NotificationProvider } from '@/contexts/NotificationContext';
import { ToastProvider } from '@/contexts/toast-context';
import { ThemeProvider } from '@/components/theme-provider';
import { suppressConsoleWarnings } from '@/lib/console-suppress';
import SimpleErrorBoundary from '@/components/simple-error-boundary';
import AppShell from '@/components/AppShell';
import MobileErrorHandler from '@/components/MobileErrorHandler';
import SmoothScrollProvider from '@/components/smooth-scroll-provider';

// Configure Inter font with only CSS variable to prevent hydration issues
const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter',
  weight: ['400', '500', '600', '700'],
});

// Suppress Next.js 15 params warnings in development
suppressConsoleWarnings();

import fs from 'fs';
import path from 'path';

export async function generateMetadata(): Promise<Metadata> {
  let appName = 'AdtU Bus Services';
  try {
    const configPath = path.join(process.cwd(), 'src', 'config', 'system_config.json');
    if (fs.existsSync(configPath)) {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      if (config.appName) appName = config.appName;
    }
  } catch (e) {
    console.error('Error reading system config for metadata:', e);
  }

  return {
    title: `${appName} - Live Tracking`,
    description: 'Real-time bus tracking and management system',
    manifest: '/manifest.json',
    appleWebApp: {
      capable: true,
      statusBarStyle: 'default',
      title: appName,
    },
    icons: {
      icon: '/favicon.ico',
      shortcut: '/favicon.ico',
      apple: '/icons/icon-192x192.png',
    },
  };
}

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`dark ${inter.variable} h-full`} suppressHydrationWarning>

      <head>
        {/* Unregister old service worker to fix cache issues */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              if ('serviceWorker' in navigator) {
                navigator.serviceWorker.getRegistrations().then(function(registrations) {
                  for(let registration of registrations) {
                    registration.unregister();
                    console.log('Old service worker unregistered');
                  }
                });
              }
            `,
          }}
        />
      </head>
      <body className="min-h-screen bg-background text-foreground transition-colors" suppressHydrationWarning>
        <MobileErrorHandler />
        <SimpleErrorBoundary>
          <ThemeProvider>
            <ToastProvider>
              <AuthProvider>
                <NotificationProvider>
                  <SmoothScrollProvider>
                    <AppShell>
                      {children}
                    </AppShell>
                  </SmoothScrollProvider>
                </NotificationProvider>
              </AuthProvider>
            </ToastProvider>
          </ThemeProvider>
        </SimpleErrorBoundary>
      </body>
    </html>
  );
}
