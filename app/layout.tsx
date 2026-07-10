import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { getSiteUrl, siteName } from "@/src/content/site";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(getSiteUrl()),
  title: {
    default: siteName,
    template: `%s | ${siteName}`,
  },
  description: "A file-authored paid newsletter platform foundation.",
  alternates: {
    types: {
      "application/rss+xml": "/rss.xml",
    },
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header className="site-header">
          <Link className="brand" href="/">
            QSCM
          </Link>
          <nav aria-label="Primary navigation">
            <Link href="/posts">Posts</Link>
            <Link href="/about">About</Link>
            <Link href="/subscribe">Subscribe</Link>
            <Link href="/account">Account</Link>
          </nav>
        </header>
        {children}
        <footer className="site-footer">
          <p>File-authored newsletter platform foundation.</p>
        </footer>
      </body>
    </html>
  );
}
