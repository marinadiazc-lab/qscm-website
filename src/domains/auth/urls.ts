export function getAuthBaseUrl(
  env: Record<string, string | undefined> = process.env,
): string {
  const rawUrl =
    env.AUTH_APP_URL ??
    env.NEXT_PUBLIC_SITE_URL ??
    env.VERCEL_PROJECT_PRODUCTION_URL ??
    "http://localhost:3000";

  const url = rawUrl.startsWith("http") ? rawUrl : `https://${rawUrl}`;

  return url.replace(/\/$/, "");
}

export function buildMagicLinkUrl(input: {
  baseUrl: string;
  token: string;
  redirectTo?: string;
}): string {
  const url = new URL("/api/auth/magic-link/consume", input.baseUrl);

  url.searchParams.set("token", input.token);

  if (input.redirectTo) {
    url.searchParams.set("redirectTo", input.redirectTo);
  }

  return url.toString();
}
