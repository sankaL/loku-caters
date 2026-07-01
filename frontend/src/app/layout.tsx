import type { Metadata } from "next";
import { Inter, Playfair_Display } from "next/font/google";
import { buildPageMetadata, SITE_URL } from "@/config/metadata";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

const playfair = Playfair_Display({
  subsets: ["latin"],
  variable: "--font-serif",
  display: "swap",
});

const homeMetadata = buildPageMetadata("home");

export const metadata: Metadata = {
  ...homeMetadata,
  metadataBase: SITE_URL,
  applicationName: "Loku Caters",
  title: {
    default: "Loku Caters | Authentic Sri Lankan Cuisine",
    template: "%s | Loku Caters",
  },
  icons: {
    icon: [
      { url: "/icon.svg", type: "image/svg+xml" },
      { url: "/logo-color.svg", type: "image/svg+xml" },
    ],
    apple: [{ url: "/logo-color.svg", type: "image/svg+xml" }],
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      data-scroll-behavior="smooth"
      className={`${inter.variable} ${playfair.variable}`}
    >
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
