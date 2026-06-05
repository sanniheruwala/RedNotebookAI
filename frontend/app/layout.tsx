import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/providers";
import { cn } from "@/lib/utils";

const sans = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-sans",
  weight: ["400", "500", "600", "700", "800"],
});

const mono = JetBrains_Mono({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-mono",
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: {
    default: "RedNotebook AI — an AI data notebook by RedAnalytica",
    template: "%s · RedNotebook AI",
  },
  description:
    "Open-source AI data notebook for Trino. Query, visualize, profile, and explore data with beautiful charts, AI suggestions, and a NotebookLM-style knowledge layer.",
  applicationName: "RedNotebook AI",
  authors: [{ name: "RedAnalytica", url: "https://redanalytica.in" }],
  keywords: [
    "RedNotebook",
    "RedAnalytica",
    "AI notebook",
    "Trino",
    "data notebook",
    "SQL",
    "analytics",
  ],
  icons: {
    icon: "/favicon.ico",
    apple: "/logo.png",
  },
  openGraph: {
    title: "RedNotebook AI",
    description:
      "Open-source AI data notebook for Trino — by RedAnalytica.",
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0a1410" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={cn(sans.variable, mono.variable, "font-sans")}
    >
      <body className="min-h-screen bg-background antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
