import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Subscribe",
  description: "Subscribe to QSCM.",
};

export default function SubscribePage() {
  return (
    <main className="page stack">
      <header className="hero">
        <p className="badge">Subscribe</p>
        <h1 className="page-title">Subscription flow placeholder</h1>
        <p className="lede">
          This page will connect to magic-link auth, Resend, and Stripe tiers.
        </p>
      </header>
      <section className="wire-panel" aria-label="Subscription form placeholder">
        <p>Email capture, free subscription, and paid tier checkout will land here.</p>
      </section>
    </main>
  );
}
