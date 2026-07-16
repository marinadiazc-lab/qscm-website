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
    <html lang="es">
      <body>
        <header className="site-header">
          <Link className="brand" href="/">
            <img alt="Qué se cuenta Marina" height="199" src="/brand/logo-primary.png" width="644" />
          </Link>
          <nav aria-label="Primary navigation">
            <Link href="/posts">Blog</Link>
            <Link href="/about">Sobre mí</Link>
            <Link href="/subscribe">Suscríbete</Link>
            <Link href="/account">Tu cuenta</Link>
          </nav>
        </header>
        {children}
        <footer className="site-footer">
          <img alt="" aria-hidden="true" height="182" src="/brand/monogram.png" width="203" />
        </footer>
      </body>
    </html>
  );
}
