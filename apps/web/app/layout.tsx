import type { Metadata } from "next";
import "./globals.css";
import { WalletProvider } from "@/lib/wallet-provider";
import { AppHeader } from "@/components/domain/AppHeader";

export const metadata: Metadata = {
  title: "SpecWeave — Semantic merge control for open standards",
  description: "Release gate for RFC-style specifications. GenLayer-powered semantic coherence review.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&family=Source+Serif+4:ital,opsz,wght@0,8..60,400;0,8..60,600;1,8..60,400&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <WalletProvider>
          <AppHeader />
          <main>{children}</main>
        </WalletProvider>
      </body>
    </html>
  );
}
