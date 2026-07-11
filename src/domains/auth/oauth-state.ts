export const OAUTH_STATE_COOKIE = "qscm_oauth_state";
export const OAUTH_STATE_MAX_AGE_SECONDS = 10 * 60;

export type OAuthStatePayload = {
  state: string;
  provider: string;
  intent: "sign_in" | "link";
  redirectTo: string;
};

export function encodeOAuthState(payload: OAuthStatePayload): string {
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

export function decodeOAuthState(value: string | undefined): OAuthStatePayload | undefined {
  if (!value) {
    return undefined;
  }

  try {
    const decoded = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as Partial<
      OAuthStatePayload
    >;

    if (
      typeof decoded.state !== "string" ||
      typeof decoded.provider !== "string" ||
      (decoded.intent !== "sign_in" && decoded.intent !== "link") ||
      typeof decoded.redirectTo !== "string" ||
      !decoded.redirectTo.startsWith("/") ||
      decoded.redirectTo.startsWith("//")
    ) {
      return undefined;
    }

    return decoded as OAuthStatePayload;
  } catch {
    return undefined;
  }
}
