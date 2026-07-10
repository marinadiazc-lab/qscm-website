# Deployment

Production URL: https://qscm-website.vercel.app

The authoritative deployment path is GitHub Actions workflow
`.github/workflows/vercel-production.yml`.

- Pushes to `main` deploy production.
- Pull requests deploy Vercel previews and publish the preview URL in GitHub.
- Manual workflow dispatch can deploy preview or production as a backup.
- Local emergency CLI deploy remains available through `npm run deploy`.

The Vercel project is linked locally through `.vercel/project.json`.

Native Vercel Git integration is intentionally not authoritative right now. The
Vercel account/scope and private GitHub repository permissions do not currently
line up, and using both native Vercel Git deploys and GitHub Actions would risk
duplicate production deploys. The current decision is to keep Actions as the
single production autodeploy path until the account/repository ownership is
changed deliberately.

Required deployment secrets are documented in `docs/env.md`:

- `VERCEL_TOKEN`
- `VERCEL_ORG_ID`
- `VERCEL_PROJECT_ID`

The deploy workflow validates those secrets before building. It then installs
dependencies, verifies `npm run build`, pulls the matching Vercel environment,
builds with Vercel, and deploys the prebuilt output.

Operational details live in `docs/runbooks/deployment.md`, including rollback,
manual deploy backup, environment parity, and smoke checks.
