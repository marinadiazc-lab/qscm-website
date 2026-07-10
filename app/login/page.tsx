import type { Metadata } from "next";
import Link from "next/link";

import { listOAuthProviderConfigs } from "@/src/domains/auth";

export const metadata: Metadata = {
  title: "Sign in",
};

export default function LoginPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  return <LoginContent searchParams={searchParams} />;
}

async function LoginContent({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = (await searchParams) ?? {};
  const status = first(params.status);
  const error = first(params.error);
  const providers = listOAuthProviderConfigs();

  return (
    <main className="page auth-page">
      <section className="auth-panel" aria-labelledby="sign-in-title">
        <div className="stack">
          <div>
            <p className="eyebrow">Account</p>
            <h1 id="sign-in-title" className="page-title compact-title">
              Sign in
            </h1>
          </div>

          {status === "magic-link-requested" ? (
            <p className="notice success">
              If email delivery is configured for this environment, a sign-in link is on its way.
            </p>
          ) : null}
          {error ? <p className="notice error">{authErrorMessage(error)}</p> : null}

          <form className="form-stack" action="/api/auth/magic-link" method="post">
            <label htmlFor="email">Email address</label>
            <input id="email" name="email" type="email" autoComplete="email" required />
            <input name="redirectTo" type="hidden" value="/account" />
            <button className="button" type="submit">
              Email me a sign-in link
            </button>
          </form>

          <div className="provider-list" aria-label="Social sign-in providers">
            {providers.map((provider) =>
              provider.enabled ? (
                <Link
                  key={provider.provider}
                  className="secondary-button provider-button"
                  href={`/api/auth/oauth/${provider.provider}`}
                >
                  Continue with {provider.displayName}
                </Link>
              ) : (
                <button
                  key={provider.provider}
                  className="secondary-button provider-button disabled"
                  type="button"
                  disabled
                  title={provider.disabledReason}
                >
                  {provider.displayName} unavailable
                </button>
              ),
            )}
          </div>
        </div>
      </section>
    </main>
  );
}

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function authErrorMessage(error: string): string {
  switch (error) {
    case "database":
      return "Account sign-in needs the database connection for this environment.";
    case "invalid-link":
      return "That sign-in link is not valid.";
    case "expired-link":
      return "That sign-in link has expired.";
    case "used-link":
      return "That sign-in link has already been used.";
    case "provider-disabled":
      return "That provider is not configured in this environment.";
    default:
      return "Sign-in could not be completed.";
  }
}
