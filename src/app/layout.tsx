import type { Metadata, Viewport } from "next";
import { Inter, Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { AuthWrapper } from "@/components/AuthProvider";
import ServiceWorkerRegistrar from "@/components/ServiceWorkerRegistrar";
import InstallPrompt from "@/components/InstallPrompt";

// Elegant pairing: Plus Jakarta Sans for display headings, Inter for UI/body.
// next/font self-hosts both, so they keep working fully offline (PWA).
const jakarta = Plus_Jakarta_Sans({
  variable: "--font-jakarta",
  subsets: ["latin"],
  display: "swap",
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
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
        className={`${jakarta.variable} ${inter.variable} antialiased bg-background text-foreground`}
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
