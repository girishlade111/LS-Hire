import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "Hire — Lade Stack",
  description: "AI-powered job application auto-reply."
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="bg-base text-text">{children}</body>
    </html>
  );
}
