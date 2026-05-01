import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "mediatracker — BioMar coverage",
  description: "Media monitoring dashboard for BioMar / Schouw & Co",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
