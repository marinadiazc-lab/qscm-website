import { NextResponse } from "next/server";
import { cookies } from "next/headers";

import {
  createOpaqueToken,
  encodeOAuthState,
  getAuthBaseUrl,
  getOAuthProviderConfig,
  OAUTH_STATE_COOKIE,
  OAUTH_STATE_MAX_AGE_SECONDS,
  parseOAuthProvider,
} from "@/src/domains/auth";
import { getCurrentAuthSession } from "@/src/domains/auth/server/runtime";

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

  const url = new URL(request.url);
  const intent = url.searchParams.get("link") === "1" ? "link" : "sign_in";
  const redirectTo = sanitizeRedirect(url.searchParams.get("redirectTo")) ?? "/account";

  if (intent === "link") {
    const auth = await getCurrentAuthSession();

    if (!auth) {
      return NextResponse.redirect(new URL("/login?error=session-required", request.url));
    }
  }

  const state = createOpaqueToken(24);
  const redirectUri = new URL(config.callbackPath, getAuthBaseUrl()).toString();
  const providerUrl = new URL(config.authUrl);

  providerUrl.searchParams.set("client_id", config.clientId!);
  providerUrl.searchParams.set("redirect_uri", redirectUri);
  providerUrl.searchParams.set("response_type", "code");
  providerUrl.searchParams.set("scope", config.scope);
  providerUrl.searchParams.set("state", state);

  if (config.provider === "apple") {
    providerUrl.searchParams.set("response_mode", "query");
  }

  const cookieStore = await cookies();

  cookieStore.set(
    OAUTH_STATE_COOKIE,
    encodeOAuthState({
      state,
      provider: config.provider,
      intent,
      redirectTo,
    }),
    {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/api/auth/oauth",
      maxAge: OAUTH_STATE_MAX_AGE_SECONDS,
    },
  );

  return NextResponse.redirect(providerUrl);
}

function sanitizeRedirect(value: string | null): string | undefined {
  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return undefined;
  }

  return value;
}
