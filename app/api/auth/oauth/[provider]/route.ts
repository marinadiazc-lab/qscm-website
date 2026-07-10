import { NextResponse } from "next/server";

import { getOAuthProviderConfig, parseOAuthProvider } from "@/src/domains/auth";

export async function GET(
  request: Request,
  context: { params: Promise<{ provider: string }> },
) {
  const { provider } = await context.params;
  const oauthProvider = parseOAuthProvider(provider);

  if (!oauthProvider) {
    return NextResponse.json({ error: "Unknown auth provider." }, { status: 404 });
  }

  const config = getOAuthProviderConfig(oauthProvider);

  if (!config.enabled) {
    return NextResponse.redirect(new URL("/login?error=provider-disabled", request.url));
  }

  return NextResponse.json(
    {
      provider: config.provider,
      enabled: config.enabled,
      callbackPath: config.callbackPath,
      message:
        "OAuth credential configuration is present. The provider callback exchange is intentionally left for the credentialed environment.",
    },
    { status: 501 },
  );
}
