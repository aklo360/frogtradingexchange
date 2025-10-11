import type { Metadata } from "next";
import { Geist, Geist_Mono, Press_Start_2P } from "next/font/google";
import "./globals.css";
import { SolanaProvider } from "@/providers/SolanaProvider";

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
    "Titan-powered Solana swap terminal with retro SNES frog theming.",
  icons: {
    // Prefer real .ico in root with PNG fallbacks
    icon: [
      { url: "/favicon.ico", rel: "icon", sizes: "any" },
      { url: "/favicon.png", rel: "icon", type: "image/png" },
    ],
    shortcut: "/favicon.ico",
    apple: "/favicon.png",
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
        <SolanaProvider>{children}</SolanaProvider>
      </body>
    </html>
  );
}
