import type { Metadata } from "next";
import {
  EmailCapture,
  SubscriptionOptions,
} from "@/src/components/subscription-options";

export const metadata: Metadata = {
  title: "Subscribe",
  description: "Subscribe to QSCM.",
};

export default function SubscribePage() {
  return (
    <main className="page stack">
      <header className="hero">
        <p className="badge">Subscribe</p>
        <h1 className="page-title">Choose a subscription path</h1>
        <p className="lede">
          This page will connect magic-link auth, Resend, and Stripe tiers. For
          now it shows the intended paths without taking payment.
        </p>
      </header>
      <EmailCapture />
      <SubscriptionOptions />
    </main>
  );
}
