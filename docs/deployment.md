# Deployment

Production URL: https://qscm-website.vercel.app

Deployment paths:

- Manual deploy: `npm run deploy`
- Auto deploy: GitHub Actions workflow `.github/workflows/vercel-production.yml`

The Vercel project is linked locally through `.vercel/project.json`.

The native Vercel Git connection could not be attached because the Vercel
account/scope and private GitHub repo permissions do not currently line up.
Instead, GitHub Actions deploys to the existing Vercel project using repository
secrets:

- `VERCEL_TOKEN`
- `VERCEL_ORG_ID`
- `VERCEL_PROJECT_ID`

Every push to `main` runs the production workflow. The workflow installs
dependencies, verifies `npm run build`, builds with Vercel, and deploys the
prebuilt output.

## Media Storage

Local development uses `MEDIA_STORAGE_PROVIDER=local`, which writes public media
under `public/media/`. Production should use Vercel Blob with credentials stored
in Vercel environment variables:

- `MEDIA_STORAGE_PROVIDER=vercel_blob`
- `BLOB_READ_WRITE_TOKEN`

Do not deploy the Vercel Blob provider until the token and production container
are provisioned. See `docs/media-storage.md` for the provider decision, CDN
behavior, and private-media limitations.
