import type { Metadata } from "next";
import {
  EmailCapture,
  SubscriptionOptions,
} from "@/src/components/subscription-options";

export const metadata: Metadata = {
  title: "Subscribe",
  description: "Subscribe to QSCM.",
};

type SubscribePageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function SubscribePage({ searchParams }: SubscribePageProps) {
  const params = (await searchParams) ?? {};
  const subscribed = params.subscribed;
  const error = params.error;

  return (
    <main className="page stack">
      <header className="hero">
        <p className="badge">Subscribe</p>
        <h1 className="page-title">Choose a subscription path</h1>
        <p className="lede">
          Join the free list now. Paid tier checkout will attach to the same
          subscriber record when billing is ready.
        </p>
      </header>
      {subscribed ? (
        <p className="notice" role="status">
          If this address can subscribe, the signup request has been received.
        </p>
      ) : null}
      {error ? (
        <p className="notice notice-error" role="alert">
          {String(error)}
        </p>
      ) : null}
      <EmailCapture />
      <SubscriptionOptions />
    </main>
  );
}
