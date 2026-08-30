import type { Metadata } from "next";
import { Inter, Yatra_One } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const yatraOne = Yatra_One({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-yatra",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Roommate Finder | Connect, Match, Live Together",
  description:
    "The platform for room seekers and listers in Nigeria. Match compatible flatmates or find vetted tenants. Identity-verified. Zero agents. Zero scams.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${inter.variable} ${yatraOne.variable}`}>
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
