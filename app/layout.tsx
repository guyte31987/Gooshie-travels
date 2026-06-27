import type { Metadata } from "next";
import { Bodoni_Moda, Hanken_Grotesk, DM_Mono, Newsreader } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/components/AuthProvider";
import ServiceWorkerRegistrar from "@/components/ServiceWorkerRegistrar";

// Design type system: Bodoni (display), Hanken (UI/body), DM Mono (labels/times),
// Newsreader italic (editorial accents). Exposed as CSS vars for Tailwind tokens.
const display = Bodoni_Moda({ subsets: ["latin"], variable: "--font-display", display: "swap" });
const sans = Hanken_Grotesk({ subsets: ["latin"], variable: "--font-sans", display: "swap" });
const mono = DM_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-mono", display: "swap" });
const accent = Newsreader({ subsets: ["latin"], style: ["italic"], variable: "--font-accent", display: "swap" });

const fontVars = `${display.variable} ${sans.variable} ${mono.variable} ${accent.variable}`;

export const metadata: Metadata = {
  title: "Gooshie Travels",
  description: "Trips, shared with friends.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={fontVars}>
      <head>
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#0d1f3c" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="Gooshie" />
        <link rel="apple-touch-icon" href="/icon-512.svg" />
      </head>
      <body>
        <ServiceWorkerRegistrar />
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
