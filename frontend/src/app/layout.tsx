import type { Metadata } from "next";
import { Inter, Playfair_Display } from "next/font/google";
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

import Navigation from "@/components/Navigation";
import Footer from "@/components/Footer";

export const metadata: Metadata = {
  title: "Loku Caters | Authentic Sri Lankan Cuisine",
  description:
    "Pre-order authentic Sri Lankan Lamprais, lovingly prepared and available for pickup. Limited quantities - reserve yours today.",
  openGraph: {
    title: "Loku Caters | Authentic Sri Lankan Cuisine",
    description: "Pre-order authentic Sri Lankan Lamprais. Limited quantities - reserve yours today.",
    type: "website",
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
      <body suppressHydrationWarning className="flex flex-col min-h-screen pt-20">
        <Navigation />
        {children}
        <Footer />
      </body>
    </html>
  );
}
