import type { Metadata } from "next";
import { Geist, Geist_Mono, Press_Start_2P } from "next/font/google";
import "./globals.css";
import { SolanaProvider } from "@/providers/SolanaProvider";
import { AudioProvider } from "@/providers/AudioProvider";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const pressStart = Press_Start_2P({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-press-start",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Frog Trading Exchange",
  description:
    "Titan-powered Solana DEX swap made by and for the Solana Business Frogs. 100% of platform fees are used to automatically buy back & burn frogs.",
  metadataBase: new URL("https://frogtrading.exchange"),
  applicationName: "Frog Trading Exchange",
  generator: "Frog Trading Exchange",
  creator: "Frog Trading Exchange",
  publisher: "Frog Trading Exchange",
  category: "finance",
  keywords: [
    "Frog Trading Exchange",
    "Solana",
    "DEX",
    "swap",
    "Solana Business Frogs",
    "SBF",
    "NFT",
    "buyback",
    "burn",
  ],
  referrer: "origin-when-cross-origin",
  formatDetection: {
    telephone: false,
  },
  alternates: {
    canonical: "/",
  },
  manifest: "/site.webmanifest",
  themeColor: "#08021e",
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "16x16 32x32 48x48" },
      { url: "/favicon-16x16.png", type: "image/png", sizes: "16x16" },
      { url: "/favicon-32x32.png", type: "image/png", sizes: "32x32" },
    ],
    shortcut: "/favicon.ico",
    apple: { url: "/apple-touch-icon.png", sizes: "180x180" },
  },
  openGraph: {
    title: "Frog Trading Exchange",
    description:
      "Titan-powered Solana DEX swap made by and for the Solana Business Frogs. 100% of platform fees are used to automatically buy back & burn frogs.",
    url: "/",
    siteName: "Frog Trading Exchange",
    locale: "en_US",
    type: "website",
    images: [
      {
        url: "/cover.jpg",
        width: 1920,
        height: 1080,
        alt: "Frog Trading Exchange cover art",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Frog Trading Exchange",
    description:
      "Titan-powered Solana DEX swap made by and for the Solana Business Frogs. 100% of platform fees are used to automatically buy back & burn frogs.",
    images: ["/cover.jpg"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${pressStart.variable}`}
      >
        <SolanaProvider>
          <AudioProvider>{children}</AudioProvider>
        </SolanaProvider>
      </body>
    </html>
  );
}
