import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import {
  decodeOAuthState,
  getAuthBaseUrl,
  getOAuthProviderConfig,
  OAUTH_STATE_COOKIE,
  parseOAuthProvider,
} from "@/src/domains/auth";
import {
  completeOAuthCallback,
  getCurrentAuthSession,
} from "@/src/domains/auth/server/runtime";

export async function GET(
  request: Request,
  context: { params: Promise<{ provider: string }> },
) {
  const { provider } = await context.params;
  const oauthProvider = parseOAuthProvider(provider);

  if (!oauthProvider) {
    return NextResponse.json({ error: "Unknown auth provider." }, { status: 404 });
  }

  const url = new URL(request.url);
  const providerError = url.searchParams.get("error");

  if (providerError) {
    return redirectToAuthSurface("provider-error", request.url);
  }

  const code = url.searchParams.get("code");
  const returnedState = url.searchParams.get("state");
  const cookieStore = await cookies();
  const storedState = decodeOAuthState(cookieStore.get(OAUTH_STATE_COOKIE)?.value);

  cookieStore.set(OAUTH_STATE_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/api/auth/oauth",
    maxAge: 0,
  });

  if (
    !code ||
    !returnedState ||
    !storedState ||
    storedState.state !== returnedState ||
    storedState.provider !== oauthProvider
  ) {
    return redirectToAuthSurface("oauth-state", request.url);
  }

  const auth = await getCurrentAuthSession();

  if (storedState.intent === "link" && !auth) {
    return redirectToAuthSurface("session-required", request.url);
  }

  try {
    const config = getOAuthProviderConfig(oauthProvider);
    const result = await completeOAuthCallback({
      provider: oauthProvider,
      code,
      redirectUri: new URL(config.callbackPath, getAuthBaseUrl()).toString(),
      targetUser: storedState.intent === "link" ? auth?.user : undefined,
      intent: storedState.intent,
    });

    if (result.status === "authenticated") {
      return NextResponse.redirect(new URL(storedState.redirectTo, request.url));
    }

    if (result.status === "linked" || result.status === "already_linked") {
      return NextResponse.redirect(
        new URL("/account?status=provider-linked", request.url),
      );
    }

    if ("reason" in result) {
      const error = oauthErrorForResult(result.status, result.reason);

      return redirectToAuthSurface(
        error,
        request.url,
        storedState.intent === "link" ? "/account" : "/login",
      );
    }

    return redirectToAuthSurface("provider-callback", request.url);
  } catch (error) {
    if (error instanceof Error && error.message.includes("DATABASE_URL")) {
      return redirectToAuthSurface("database", request.url);
    }

    throw error;
  }
}

function oauthErrorForResult(status: string, reason: string): string {
  if (status === "requires_confirmation") {
    return "provider-confirmation-required";
  }

  if (reason === "disabled_user") {
    return "disabled-user";
  }

  if (reason === "provider_account_inactive") {
    return "provider-account-inactive";
  }

  return "provider-callback";
}

function redirectToAuthSurface(
  error: string,
  requestUrl: string,
  surface: "/account" | "/login" = "/login",
) {
  return NextResponse.redirect(new URL(`${surface}?error=${error}`, requestUrl));
}
