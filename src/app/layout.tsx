import type { Metadata } from "next";
import { IBM_Plex_Mono, IBM_Plex_Sans_Condensed } from "next/font/google";
import "leaflet/dist/leaflet.css";
import "./globals.css";

const aviationSans = IBM_Plex_Sans_Condensed({
  variable: "--font-aviation-sans",
  weight: ["400", "500", "600", "700"],
  subsets: ["latin"],
});

const aviationMono = IBM_Plex_Mono({
  variable: "--font-aviation-mono",
  weight: ["400", "500", "600", "700"],
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "AI ATC: Sydney Arrival Optimiser",
  description: "A demo ATC arrival sequencing simulator for Sydney Airport.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${aviationSans.variable} ${aviationMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
