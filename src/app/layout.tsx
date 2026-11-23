import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { AuthWrapper } from "@/components/AuthProvider";
import ServiceWorkerRegistrar from "@/components/ServiceWorkerRegistrar";
import InstallPrompt from "@/components/InstallPrompt";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: 'Qorannoo Dhibayyuu / Dhibayyuu Sub-City Data Collection',
  description:
    'Mobile-based data collection platform for Dhibayyuu Sub-City — industry, hotel, health, education and agriculture surveys with live insights.',
  icons: {
    icon: '/icon.png',
    apple: '/icon-512.png',
  },
  manifest: '/manifest.json',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        <AuthWrapper>
          {children}
          <Toaster />
          <ServiceWorkerRegistrar />
          <InstallPrompt />
        </AuthWrapper>
      </body>
    </html>
  );
}
