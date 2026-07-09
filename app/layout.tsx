import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "QSCM",
    template: "%s | QSCM",
  },
  description: "A file-authored paid newsletter platform foundation.",
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
            <Link href="/subscribe">Subscribe</Link>
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
