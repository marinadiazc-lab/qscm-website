# Environment Variables

This app currently has no required runtime secrets. Deployment is handled by
GitHub Actions and Vercel, so the required variables today are deployment
secrets plus one optional public site URL for local parity.

Never commit real secrets. Use `.env.local` for local development, Vercel
project environment variables for preview and production runtime values, and
GitHub repository secrets for Actions deploy credentials.

## Required Deployment Secrets

These values must exist in GitHub repository secrets for the deploy workflow.
The workflow validates them before it installs dependencies so missing values
fail with a clear error.

| Name | Owner | Purpose | Local | Preview | Production |
| --- | --- | --- | --- | --- | --- |
| `VERCEL_TOKEN` | Vercel project owner | Authenticates Vercel CLI deploys from GitHub Actions. | Optional; use `vercel login` or a local token. | Required GitHub secret. | Required GitHub secret. |
| `VERCEL_ORG_ID` | Vercel project owner | Selects the Vercel account or team that owns the project. | Optional in `.env.local` after `vercel link`. | Required GitHub secret. | Required GitHub secret. |
| `VERCEL_PROJECT_ID` | Vercel project owner | Selects the `qscm-website` Vercel project. | Optional in `.env.local` after `vercel link`. | Required GitHub secret. | Required GitHub secret. |

## Optional Runtime Values

| Name | Owner | Purpose | Local | Preview | Production |
| --- | --- | --- | --- | --- | --- |
| `NEXT_PUBLIC_SITE_URL` | App maintainer | Canonical public URL for smoke checks and future absolute URL generation. It is public because it is exposed to browser bundles. | `http://localhost:3000` | The generated Vercel preview URL when needed. | `https://qscm-website.vercel.app` |

## Planned Values

Database-backed features are not deployed yet. Issue #151 owns the migration
command, production migration policy, and failed-migration rollback behavior.
Until that lands, do not add `DATABASE_URL` or provider credentials to the
deployment workflow.

Future provider variables should follow this checklist before being marked
required:

- The owning provider account is named.
- Local, preview, and production values are distinct.
- Sandbox/test credentials are used in preview.
- Live credentials are used only in production.
- Missing required values fail at build or startup with the variable name.
- Secret values are stored only in `.env.local`, Vercel, or GitHub secrets.
