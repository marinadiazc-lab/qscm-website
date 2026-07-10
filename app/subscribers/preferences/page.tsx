import type { Metadata } from "next";

import { DatabaseSubscriberRepository } from "@/src/domains/subscribers/database-repository";
import { getDefaultPublicationId } from "@/src/domains/subscribers/runtime";
import { normalizeSubscriberEmail } from "@/src/domains/subscribers";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Subscriber Preferences",
  description: "Manage QSCM email preferences.",
};

type PreferencesPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function SubscriberPreferencesPage({
  searchParams,
}: PreferencesPageProps) {
  const params = (await searchParams) ?? {};
  const subscriberId = first(params.subscriberId);
  const email = first(params.email);
  const saved = first(params.saved);
  const error = first(params.error);
  const repository = new DatabaseSubscriberRepository();
  const publicationId = await getDefaultPublicationId();
  const subscriber = subscriberId
    ? await repository.findSubscriberById(subscriberId)
    : email
      ? await repository.findSubscriberByEmail(publicationId, normalizeSubscriberEmail(email))
      : undefined;
  const preferences = subscriber
    ? await repository.findPreferences(subscriber.id)
    : undefined;

  return (
    <main className="page stack">
      <header className="hero">
        <p className="badge">Preferences</p>
        <h1 className="page-title">Email settings</h1>
        <p className="lede">
          Update local subscriber preferences and queue provider sync for the
          next Resend reconciliation pass.
        </p>
      </header>
      {saved ? (
        <p className="notice" role="status">
          Preferences saved.
        </p>
      ) : null}
      {error ? (
        <p className="notice notice-error" role="alert">
          {error}
        </p>
      ) : null}
      {subscriber ? (
        <section className="wire-panel">
          <h2>{subscriber.email}</h2>
          <form action="/api/subscribers/preferences" className="form-grid" method="post">
            <input name="subscriberId" type="hidden" value={subscriber.id} />
            <input
              name="redirectTo"
              type="hidden"
              value={`/subscribers/preferences?subscriberId=${subscriber.id}`}
            />
            <label className="checkbox-row">
              <input
                defaultChecked={preferences?.marketingEmailOptIn ?? true}
                name="marketingEmailOptIn"
                type="checkbox"
              />
              Marketing and newsletter email
            </label>
            <label className="checkbox-row">
              <input
                defaultChecked={preferences?.productEmailOptIn ?? true}
                name="productEmailOptIn"
                type="checkbox"
              />
              Product and subscription email
            </label>
            <label className="checkbox-row">
              <input
                defaultChecked={preferences?.commentNotificationOptIn ?? true}
                name="commentNotificationOptIn"
                type="checkbox"
              />
              Comment notifications
            </label>
            <label className="checkbox-row danger-row">
              <input name="unsubscribe" type="checkbox" />
              Unsubscribe from marketing and product email
            </label>
            <button className="button" type="submit">
              Save preferences
            </button>
          </form>
        </section>
      ) : (
        <section className="wire-panel">
          <h2>Find preferences</h2>
          <form className="form-row" method="get">
            <input
              aria-label="Email address"
              name="email"
              placeholder="you@example.com"
              required
              type="email"
            />
            <button className="button" type="submit">
              Continue
            </button>
          </form>
        </section>
      )}
    </main>
  );
}

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}
