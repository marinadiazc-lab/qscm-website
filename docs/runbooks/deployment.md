# Deployment Runbook

Production URL: https://qscm-website.vercel.app

Authoritative deployment path: GitHub Actions workflow
`.github/workflows/vercel-production.yml`.

Native Vercel Git integration is intentionally not the production autodeploy
path right now. The Vercel account/scope and private GitHub repository
permissions do not currently line up, and keeping Actions as the only
authoritative autodeploy path avoids duplicate production deploys.

## Automatic Deploys

- Pushes to `main` deploy production.
- Pull requests deploy Vercel previews.
- Manual workflow dispatch can deploy either preview or production.

Each deploy installs dependencies, runs `npm run build`, pulls the matching
Vercel environment, builds a Vercel output, and deploys that prebuilt output.
The workflow fails early if `VERCEL_TOKEN`, `VERCEL_ORG_ID`, or
`VERCEL_PROJECT_ID` is missing.

Preview URLs are available in the workflow summary and are commented on pull
requests.

## Manual Deploy Backup

Use the manual path only when GitHub Actions is unavailable or a maintainer is
intentionally validating the CLI fallback.

1. Confirm the local checkout is on the commit that should be deployed.
2. Confirm Vercel CLI access with the project owner account.
3. Run `npm ci`.
4. Run `npm run build`.
5. Run `npm run deploy`.
6. Paste the deployed URL into the release notes or incident channel.
7. Run the smoke checklist below.

Manual deploys must not be used to skip database migrations. Database migration
deployment is blocked on issue #151; until it lands, production releases must
not assume a migration step exists.

## Rollback

Use rollback for a bad app deploy when the previous production build is still
compatible with the current data model.

1. Open the Vercel project deployments list.
2. Identify the last known-good production deployment.
3. Use Vercel's rollback or promote action to move production traffic back to
   that deployment.
4. Record the rolled-back deployment URL, previous deployment URL, commit SHA,
   reason, and operator.
5. Run the production smoke checklist.
6. Open a follow-up fix issue or pull request before re-deploying.

If the bad deploy included a database change, prefer a forward fix unless the
database owner has already documented and rehearsed a safe rollback. The
database migration command and failed-migration behavior are owned by issue
#151, so app rollback must not imply database rollback yet.

Rollback still needs to be rehearsed on a non-critical deploy before issue #152
can be considered fully complete.

## Environment Parity Checklist

Run this checklist when adding or changing environment variables:

- `.env.example` contains every local variable name without secret values.
- `docs/env.md` names the owner, purpose, and local/preview/production value
  distinction for each required variable.
- GitHub Actions and Vercel use the same required variable names.
- Preview uses sandbox/test provider credentials.
- Production uses live provider credentials.
- Provider redirect URLs include local, preview, and production origins when
  the provider requires allowlists.
- Missing required deploy secrets fail before deployment.
- `npm run build` passes locally and in GitHub Actions.
- A production smoke check is run after deploy.

## Smoke Checklist

After a production deploy or rollback:

1. Visit https://qscm-website.vercel.app.
2. Confirm the home page renders without a server error.
3. Open at least one content page.
4. Confirm the deployment URL in Vercel points to the expected commit.
5. Record the result in the pull request, release notes, or incident record.

## Milestone Completion Ritual

When a milestone epic is ready to close:

1. Deploy the finished branch to Vercel.
2. Verify production with the smoke checklist.
3. Use `say` with a brief, casual, non-technical update for Marina.
4. Open the browser to the production site, preview, or pull request when there
   is something useful to try or inspect.

Do not create duplicate dashboard milestones for deployment follow-up work. M12
already owns Marina's admin dashboard scope.
