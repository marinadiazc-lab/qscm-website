import type { OAuthProvider } from "../types";

export type OAuthProviderConfig = {
  provider: OAuthProvider;
  displayName: string;
  clientId?: string;
  clientSecret?: string;
  scope: string;
  authUrl: string;
  tokenUrl: string;
  callbackPath: string;
  enabled: boolean;
  disabledReason?: string;
};

const providerDefinitions: Record<
  OAuthProvider,
  Omit<OAuthProviderConfig, "clientId" | "clientSecret" | "enabled" | "disabledReason">
> = {
  google: {
    provider: "google",
    displayName: "Google",
    scope: "openid email profile",
    authUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    callbackPath: "/api/auth/oauth/google/callback",
  },
  facebook: {
    provider: "facebook",
    displayName: "Facebook",
    scope: "email public_profile",
    authUrl: "https://www.facebook.com/v20.0/dialog/oauth",
    tokenUrl: "https://graph.facebook.com/v20.0/oauth/access_token",
    callbackPath: "/api/auth/oauth/facebook/callback",
  },
  apple: {
    provider: "apple",
    displayName: "Apple",
    scope: "name email",
    authUrl: "https://appleid.apple.com/auth/authorize",
    tokenUrl: "https://appleid.apple.com/auth/token",
    callbackPath: "/api/auth/oauth/apple/callback",
  },
};

const envKeys: Record<OAuthProvider, { clientId: string; clientSecret: string }> = {
  google: {
    clientId: "AUTH_GOOGLE_CLIENT_ID",
    clientSecret: "AUTH_GOOGLE_CLIENT_SECRET",
  },
  facebook: {
    clientId: "AUTH_FACEBOOK_CLIENT_ID",
    clientSecret: "AUTH_FACEBOOK_CLIENT_SECRET",
  },
  apple: {
    clientId: "AUTH_APPLE_CLIENT_ID",
    clientSecret: "AUTH_APPLE_CLIENT_SECRET",
  },
};

export function getOAuthProviderConfig(
  provider: OAuthProvider,
  env: Record<string, string | undefined> = process.env,
): OAuthProviderConfig {
  const definition = providerDefinitions[provider];
  const keys = envKeys[provider];
  const clientId = env[keys.clientId];
  const clientSecret = env[keys.clientSecret];
  const enabled = Boolean(clientId && clientSecret);

  return {
    ...definition,
    clientId,
    clientSecret,
    enabled,
    disabledReason: enabled
      ? undefined
      : `${definition.displayName} sign-in is disabled until ${keys.clientId} and ${keys.clientSecret} are configured.`,
  };
}

export function listOAuthProviderConfigs(
  env: Record<string, string | undefined> = process.env,
): OAuthProviderConfig[] {
  return (Object.keys(providerDefinitions) as OAuthProvider[]).map((provider) =>
    getOAuthProviderConfig(provider, env),
  );
}
