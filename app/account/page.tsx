import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { getCurrentAuthSession } from "@/src/domains/auth/server/runtime";

export const metadata: Metadata = {
  title: "Account",
};

export default async function AccountPage() {
  const auth = await getCurrentAuthSession();

  if (!auth) {
    redirect("/login?redirectTo=/account");
  }

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
          <p className="muted">
            Subscription details will appear here when billing data is connected.
          </p>
          <Link className="secondary-button" href="/subscribe">
            View plans
          </Link>
        </article>

        <article className="account-card">
          <h2>Podcast feed</h2>
          <p className="muted">
            Private feed controls will appear here after podcast entitlement data is wired.
          </p>
        </article>
      </section>
    </main>
  );
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
