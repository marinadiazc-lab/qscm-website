import type { OAuthProviderProfile } from "../types";
import type { OAuthProviderConfig } from "./config";

export class OAuthProviderError extends Error {
  constructor(
    message: string,
    readonly code: "token_exchange_failed" | "profile_fetch_failed" | "invalid_profile",
  ) {
    super(message);
    this.name = "OAuthProviderError";
  }
}

export type OAuthTokenResponse = {
  access_token?: string;
  id_token?: string;
  token_type?: string;
  expires_in?: number;
  scope?: string;
};

export interface OAuthProviderClient {
  exchangeCode(input: {
    config: OAuthProviderConfig;
    code: string;
    redirectUri: string;
  }): Promise<OAuthTokenResponse>;
  fetchProfile(input: {
    config: OAuthProviderConfig;
    token: OAuthTokenResponse;
  }): Promise<OAuthProviderProfile>;
}

export class FetchOAuthProviderClient implements OAuthProviderClient {
  async exchangeCode(input: {
    config: OAuthProviderConfig;
    code: string;
    redirectUri: string;
  }): Promise<OAuthTokenResponse> {
    if (!input.config.clientId || !input.config.clientSecret) {
      throw new OAuthProviderError(
        `${input.config.displayName} credentials are not configured.`,
        "token_exchange_failed",
      );
    }

    const body = new URLSearchParams({
      grant_type: "authorization_code",
      code: input.code,
      redirect_uri: input.redirectUri,
      client_id: input.config.clientId,
      client_secret: input.config.clientSecret,
    });
    const response = await fetch(input.config.tokenUrl, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        accept: "application/json",
      },
      body,
    });
    const payload = (await response.json().catch(() => ({}))) as OAuthTokenResponse & {
      error?: string;
      error_description?: string;
    };

    if (!response.ok || payload.error) {
      throw new OAuthProviderError(
        payload.error_description ?? payload.error ?? "OAuth token exchange failed.",
        "token_exchange_failed",
      );
    }

    return payload;
  }

  async fetchProfile(input: {
    config: OAuthProviderConfig;
    token: OAuthTokenResponse;
  }): Promise<OAuthProviderProfile> {
    if (input.config.provider === "apple") {
      throw new OAuthProviderError(
        "Apple sign-in is disabled until id_token signature and claim verification is implemented.",
        "invalid_profile",
      );
    }

    if (!input.config.userInfoUrl || !input.token.access_token) {
      throw new OAuthProviderError(
        `${input.config.displayName} did not return a usable access token.`,
        "profile_fetch_failed",
      );
    }

    const response = await fetch(input.config.userInfoUrl, {
      headers: {
        authorization: `Bearer ${input.token.access_token}`,
        accept: "application/json",
      },
    });
    const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;

    if (!response.ok) {
      throw new OAuthProviderError(
        "OAuth profile fetch failed.",
        "profile_fetch_failed",
      );
    }

    if (input.config.provider === "google") {
      return googleProfileFromPayload(payload);
    }

    return facebookProfileFromPayload(payload);
  }
}

export function googleProfileFromPayload(payload: Record<string, unknown>): OAuthProviderProfile {
  const sub = stringValue(payload.sub);

  if (!sub) {
    throw new OAuthProviderError("Google profile is missing a subject.", "invalid_profile");
  }

  return {
    provider: "google",
    providerAccountId: sub,
    email: stringValue(payload.email),
    emailVerified: payload.email_verified === true || payload.email_verified === "true",
    displayName: stringValue(payload.name),
    avatarUrl: stringValue(payload.picture),
  };
}

export function facebookProfileFromPayload(payload: Record<string, unknown>): OAuthProviderProfile {
  const id = stringValue(payload.id);

  if (!id) {
    throw new OAuthProviderError("Facebook profile is missing an id.", "invalid_profile");
  }

  return {
    provider: "facebook",
    providerAccountId: id,
    email: stringValue(payload.email),
    emailVerified: false,
    displayName: stringValue(payload.name),
    avatarUrl: pictureUrl(payload.picture),
  };
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function pictureUrl(value: unknown): string | undefined {
  if (!value || typeof value !== "object" || !("data" in value)) {
    return undefined;
  }

  const data = (value as { data?: unknown }).data;

  if (!data || typeof data !== "object" || !("url" in data)) {
    return undefined;
  }

  return stringValue((data as { url?: unknown }).url);
}
