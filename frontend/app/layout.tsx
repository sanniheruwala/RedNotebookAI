import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { Providers } from "@/components/providers";
import { cn } from "@/lib/utils";

// Self-hosted variable fonts (SIL Open Font License). Self-hosting keeps
// production builds air-gapped from Google Fonts so Docker / CI runs don't
// fail when fonts.googleapis.com is rate-limited or unreachable. License
// files live next to the woff2 files under app/fonts/.
const sans = localFont({
  src: "./fonts/Inter-Variable.woff2",
  variable: "--font-sans",
  display: "swap",
  weight: "100 900",
});

const mono = localFont({
  src: "./fonts/JetBrainsMono-Variable.woff2",
  variable: "--font-mono",
  display: "swap",
  weight: "100 800",
});

export const metadata: Metadata = {
  title: {
    default: "RedNotebook AI, an AI data notebook by RedAnalytica",
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
      "Open-source AI data notebook for Trino, by RedAnalytica.",
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
