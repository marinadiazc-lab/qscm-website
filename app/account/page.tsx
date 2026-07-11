import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { getCurrentAuthSession } from "@/src/domains/auth/server/runtime";
import { BillingService } from "@/src/domains/billing";
import { getDefaultPublicationId } from "@/src/domains/subscribers/runtime";

export const metadata: Metadata = {
  title: "Account",
};

export default async function AccountPage() {
  const auth = await getCurrentAuthSession();

  if (!auth) {
    redirect("/login?redirectTo=/account");
  }

  const publicationId = await getDefaultPublicationId();
  const billing = await new BillingService().getAccountBillingStatus({
    publicationId,
    userId: auth.user.id,
  });
  const podcastFeedUrl = getAccountPodcastFeedUrl(auth.user.metadata);

  return (
    <main className="page account-page">
      <section className="section account-header">
        <div>
          <p className="eyebrow">Account</p>
          <h1 className="page-title compact-title">Your account</h1>
        </div>
        <form action="/api/auth/logout" method="post">
          <button className="secondary-button" type="submit">
            Sign out
          </button>
        </form>
      </section>

      <section className="account-grid" aria-label="Account details">
        <article className="account-card">
          <h2>Profile</h2>
          <dl className="detail-list">
            <div>
              <dt>Email</dt>
              <dd>{auth.user.email}</dd>
            </div>
            <div>
              <dt>Status</dt>
              <dd>{auth.user.status}</dd>
            </div>
            <div>
              <dt>Roles</dt>
              <dd>{auth.user.roles.join(", ")}</dd>
            </div>
          </dl>
        </article>

        <article className="account-card">
          <h2>Linked providers</h2>
          <ul className="plain-list">
            {auth.accounts.length > 0 ? (
              auth.accounts.map((account) => (
                <li key={account.id}>
                  <span>{providerLabel(account.provider)}</span>
                  <span className="muted">{account.status}</span>
                </li>
              ))
            ) : (
              <li>No providers are linked yet.</li>
            )}
          </ul>
          <Link className="secondary-button" href="/login">
            Link another provider
          </Link>
        </article>

        <article className="account-card">
          <h2>Subscription</h2>
          <dl className="detail-list">
            <div>
              <dt>Tier</dt>
              <dd>{billing.tierName ?? "Free"}</dd>
            </div>
            <div>
              <dt>Status</dt>
              <dd>{billing.label}</dd>
            </div>
            {billing.currentPeriodEnd ? (
              <div>
                <dt>{billing.cancelAtPeriodEnd ? "Access until" : "Renews"}</dt>
                <dd>{formatDate(billing.currentPeriodEnd)}</dd>
              </div>
            ) : null}
          </dl>
          <div className="toolbar">
            <Link className="secondary-button" href="/subscribe">
              View plans
            </Link>
            {billing.canOpenPortal ? (
              <form action="/api/billing/portal" method="post">
                <input name="publicationId" type="hidden" value={publicationId} />
                <button className="secondary-button" type="submit">
                  Manage billing
                </button>
              </form>
            ) : null}
          </div>
        </article>

        <article className="account-card">
          <h2>Podcast feed</h2>
          {podcastFeedUrl ? (
            <>
              <p className="muted">Use this private RSS URL in your podcast app.</p>
              <input className="text-input" readOnly value={podcastFeedUrl} />
            </>
          ) : (
            <p className="muted">
              Private feed controls will appear here after podcast token issuance is wired.
            </p>
          )}
        </article>
      </section>
    </main>
  );
}

function getAccountPodcastFeedUrl(metadata: Record<string, unknown> | undefined) {
  const metadataFeedUrl = metadata?.privatePodcastFeedUrl;

  if (typeof metadataFeedUrl === "string" && metadataFeedUrl.startsWith("https://")) {
    return metadataFeedUrl;
  }

  return undefined;
}

function providerLabel(provider: string): string {
  switch (provider) {
    case "email_magic_link":
      return "Magic-link email";
    case "google":
      return "Google";
    case "facebook":
      return "Facebook";
    case "apple":
      return "Apple";
    default:
      return provider;
  }
}

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
  }).format(date);
}
