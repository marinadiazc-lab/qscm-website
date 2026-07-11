import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { listOAuthProviderConfigs } from "@/src/domains/auth";
import { getCurrentAuthSession } from "@/src/domains/auth/server/runtime";

export const metadata: Metadata = {
  title: "Account",
};

export default async function AccountPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const auth = await getCurrentAuthSession();

  if (!auth) {
    redirect("/login?redirectTo=/account");
  }

  const params = (await searchParams) ?? {};
  const status = first(params.status);
  const error = first(params.error);
  const providers = listOAuthProviderConfigs();
  const linkedProviders = new Set(auth.accounts.map((account) => account.provider));
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
        {status === "provider-linked" ? (
          <p className="notice success">Provider account linked.</p>
        ) : null}
        {error ? <p className="notice error">{accountErrorMessage(error)}</p> : null}

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
          <div className="provider-list compact-provider-list" aria-label="Link providers">
            {providers.map((provider) =>
              provider.enabled && !linkedProviders.has(provider.provider) ? (
                <Link
                  key={provider.provider}
                  className="secondary-button provider-button"
                  href={`/api/auth/oauth/${provider.provider}?link=1&redirectTo=/account`}
                >
                  Link {provider.displayName}
                </Link>
              ) : (
                <button
                  key={provider.provider}
                  className="secondary-button provider-button disabled"
                  type="button"
                  disabled
                  title={
                    linkedProviders.has(provider.provider)
                      ? `${provider.displayName} is already linked.`
                      : provider.disabledReason
                  }
                >
                  {linkedProviders.has(provider.provider)
                    ? `${provider.displayName} linked`
                    : `${provider.displayName} unavailable`}
                </button>
              ),
            )}
          </div>
        </article>

        <article className="account-card">
          <h2>Subscription</h2>
          <p className="muted">
            Subscription details will appear here when billing data is connected.
          </p>
          <Link className="secondary-button" href="/subscribe">
            View plans
          </Link>
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

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
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

function accountErrorMessage(error: string): string {
  switch (error) {
    case "provider-confirmation-required":
      return "That provider needs an explicit support confirmation before it can be linked.";
    case "provider-account-inactive":
      return "That provider account cannot be used for sign-in.";
    case "disabled-user":
      return "This account is disabled.";
    case "provider-callback":
      return "Provider linking could not be completed.";
    case "oauth-state":
      return "Provider linking expired. Please try again.";
    case "database":
      return "Account linking needs the database connection for this environment.";
    default:
      return "Account linking could not be completed.";
  }
}
