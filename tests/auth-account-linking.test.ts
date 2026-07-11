import { describe, expect, it } from "vitest";
import {
  accountLinkingRecordFromDecision,
  authAccountFromOAuthProfile,
  authSessionStatusForTime,
  authorizeAdminSurface,
  buildMagicLinkUrl,
  canConsumeMagicLink,
  consumeMagicLinkRequest,
  decodeOAuthState,
  decideOAuthAccountLink,
  encodeOAuthState,
  getAuthBaseUrl,
  getOAuthProviderConfig,
  hasAuthRole,
  launchAuthRoles,
  InMemoryAuthRepository,
  normalizeAuthEmail,
  requireAnyAuthRole,
  requireAuthRole,
  revokeMagicLinkRequest,
  sanitizeInternalRedirect,
  type AuthAccount,
  type AuthSession,
  type AuthUser,
  type MagicLinkRequest,
  type OAuthProviderProfile,
} from "../src/domains/auth";

const now = new Date("2026-07-10T12:00:00.000Z");

function user(overrides: Partial<AuthUser> = {}): AuthUser {
  return {
    id: "user_1",
    email: "reader@example.com",
    roles: ["reader"],
    status: "active",
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function account(overrides: Partial<AuthAccount> = {}): AuthAccount {
  return {
    id: "acct_1",
    userId: "user_1",
    provider: "google",
    providerAccountId: "google_1",
    status: "active",
    linkedAt: now,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe("OAuth account linking decisions", () => {
  it("normalizes auth email addresses", () => {
    expect(normalizeAuthEmail(" Reader@Example.COM ")).toBe("reader@example.com");
  });

  it("links a verified provider account to the signed-in user when emails match", () => {
    expect(
      decideOAuthAccountLink({
        targetUser: user({ email: "Reader@Example.com" }),
        profile: {
          provider: "google",
          providerAccountId: "google_1",
          email: "reader@example.com",
          emailVerified: true,
        },
      }),
    ).toMatchObject({
      outcome: "link",
      reason: "explicit_verified_email_match",
      targetUserId: "user_1",
    });
  });

  it("rejects provider account conflicts and avoids silent merges for existing emails", () => {
    expect(
      decideOAuthAccountLink({
        targetUser: user({ id: "user_2" }),
        existingAccount: account({ userId: "user_1" }),
        profile: {
          provider: "google",
          providerAccountId: "google_1",
          email: "reader@example.com",
          emailVerified: true,
        },
      }),
    ).toMatchObject({
      outcome: "reject",
      reason: "provider_account_conflict",
      existingUserId: "user_1",
      targetUserId: "user_2",
    });

    expect(
      decideOAuthAccountLink({
        existingUserWithEmail: user(),
        profile: {
          provider: "apple",
          providerAccountId: "apple_1",
          email: "reader@example.com",
          emailVerified: true,
        },
      }),
    ).toMatchObject({
      outcome: "requires_confirmation",
      reason: "verified_email_match_requires_confirmation",
      existingUserId: "user_1",
    });
  });

  it("treats an already-linked provider as sign-in when no target user is present", () => {
    expect(
      decideOAuthAccountLink({
        existingAccount: account({ userId: "user_1" }),
        profile: {
          provider: "google",
          providerAccountId: "google_1",
          email: "reader@example.com",
          emailVerified: true,
        },
      }),
    ).toMatchObject({
      outcome: "already_linked",
      reason: "provider_account_already_linked",
      targetUserId: "user_1",
    });
  });

  it("requires confirmation for unverified or mismatched emails", () => {
    expect(
      decideOAuthAccountLink({
        targetUser: user(),
        profile: {
          provider: "facebook",
          providerAccountId: "facebook_1",
          email: "reader@example.com",
          emailVerified: false,
        },
      }),
    ).toMatchObject({
      outcome: "requires_confirmation",
      reason: "unverified_email_requires_confirmation",
    });

    expect(
      decideOAuthAccountLink({
        targetUser: user(),
        profile: {
          provider: "google",
          providerAccountId: "google_2",
          email: "other@example.com",
          emailVerified: true,
        },
      }),
    ).toMatchObject({
      outcome: "requires_confirmation",
      reason: "email_mismatch_requires_confirmation",
    });
  });
});

describe("OAuth account linking persistence helpers", () => {
  const profile: OAuthProviderProfile = {
    provider: "google",
    providerAccountId: "google_1",
    email: "Reader@Example.com",
    emailVerified: true,
    displayName: "Reader",
    avatarUrl: "https://example.com/avatar.png",
  };

  it("builds audit records from linking decisions without raw tokens", () => {
    const decision = decideOAuthAccountLink({
      targetUser: user(),
      profile,
    });
    const record = accountLinkingRecordFromDecision({
      id: "link_1",
      decision,
      profile,
      createdAt: now,
      metadata: { intent: "link" },
    });

    expect(record).toMatchObject({
      id: "link_1",
      userId: "user_1",
      provider: "google",
      providerAccountId: "google_1",
      email: "reader@example.com",
      decisionOutcome: "link",
      decisionReason: "explicit_verified_email_match",
      metadata: {
        intent: "link",
        targetUserId: "user_1",
      },
    });
  });

  it("persists account-linking records defensively in memory", () => {
    const repository = new InMemoryAuthRepository();
    const record = accountLinkingRecordFromDecision({
      id: "link_1",
      decision: decideOAuthAccountLink({ targetUser: user(), profile }),
      profile,
      createdAt: now,
    });

    const saved = repository.saveAccountLinkingRecord(record);
    saved.metadata!.message = "changed";

    expect(repository.listAccountLinkingRecordsForProvider("google", "google_1")).toMatchObject([
      {
        id: "link_1",
        metadata: {
          message: "The verified provider email matches the signed-in user.",
        },
      },
    ]);
  });

  it("builds active auth accounts from provider profiles", () => {
    expect(
      authAccountFromOAuthProfile({
        id: "acct_1",
        userId: "user_1",
        profile,
        now,
      }),
    ).toMatchObject({
      id: "acct_1",
      userId: "user_1",
      provider: "google",
      providerAccountId: "google_1",
      email: "reader@example.com",
      emailVerifiedAt: now,
      status: "active",
      lastAuthenticatedAt: now,
    });
  });
});

describe("sessions and magic links", () => {
  const requestedLink: MagicLinkRequest = {
    id: "magic_1",
    email: "reader@example.com",
    tokenHash: "hash_1",
    status: "requested",
    requestedAt: new Date("2026-07-10T11:55:00.000Z"),
    expiresAt: new Date("2026-07-10T12:05:00.000Z"),
  };

  it("reports active, expired, and revoked session states", () => {
    const session: AuthSession = {
      id: "session_1",
      userId: "user_1",
      tokenHash: "hash",
      status: "active",
      createdAt: now,
      expiresAt: new Date("2026-07-10T13:00:00.000Z"),
    };

    expect(authSessionStatusForTime(session, now)).toBe("active");
    expect(authSessionStatusForTime({ ...session, expiresAt: now }, now)).toBe("expired");
    expect(authSessionStatusForTime({ ...session, revokedAt: now }, now)).toBe("revoked");
  });

  it("only consumes requested, unexpired magic links", () => {
    expect(canConsumeMagicLink(requestedLink, now)).toBe(true);

    const consumed = consumeMagicLinkRequest(requestedLink, now, "session_1");
    expect(consumed).toMatchObject({
      status: "consumed",
      sessionId: "session_1",
      consumedAt: now,
    });
    expect(revokeMagicLinkRequest(consumed, now)).toBe(consumed);

    expect(
      consumeMagicLinkRequest(
        { ...requestedLink, expiresAt: new Date("2026-07-10T11:00:00.000Z") },
        now,
      ),
    ).toMatchObject({ status: "expired" });
  });

  it("claims a magic link only once before session work can proceed", () => {
    const repository = new InMemoryAuthRepository({
      magicLinkRequests: [requestedLink],
    });

    expect(repository.claimMagicLinkRequest("hash_1", now)).toMatchObject({
      id: "magic_1",
      status: "consumed",
      consumedAt: now,
    });
    expect(repository.claimMagicLinkRequest("hash_1", now)).toBeUndefined();
  });

  it("allows only one concurrent-ish claimant for the same magic link", async () => {
    const repository = new InMemoryAuthRepository({
      magicLinkRequests: [requestedLink],
    });
    const [first, second] = await Promise.all([
      repository.claimMagicLinkRequest("hash_1", now),
      repository.claimMagicLinkRequest("hash_1", now),
    ]);

    expect([first, second].filter(Boolean)).toHaveLength(1);
    expect(repository.findMagicLinkRequestByTokenHash("hash_1")).toMatchObject({
      status: "consumed",
    });
  });

  it("does not claim expired magic links", () => {
    const repository = new InMemoryAuthRepository({
      magicLinkRequests: [
        {
          ...requestedLink,
          expiresAt: new Date("2026-07-10T11:59:59.000Z"),
        },
      ],
    });

    expect(repository.claimMagicLinkRequest("hash_1", now)).toBeUndefined();
    expect(repository.findMagicLinkRequestByTokenHash("hash_1")).toMatchObject({
      status: "requested",
    });
  });
});

describe("in-memory auth repository", () => {
  it("stores defensive copies and finds users by normalized email", () => {
    const repository = new InMemoryAuthRepository();
    const saved = repository.saveUser(user({ email: "Reader@Example.com", roles: ["reader"] }));

    saved.roles.push("admin");

    expect(repository.findUserByEmail(" reader@example.COM ")).toMatchObject({
      id: "user_1",
      roles: ["reader"],
    });
    expect(hasAuthRole(repository.findUserById("user_1")!, "admin")).toBe(false);
  });
});

describe("provider configuration", () => {
  it("keeps OAuth providers disabled until credentials are present", () => {
    const config = getOAuthProviderConfig("google", {});

    expect(config.enabled).toBe(false);
    expect(config.disabledReason).toContain("AUTH_GOOGLE_CLIENT_ID");
  });

  it("enables an OAuth provider when both env credentials are present", () => {
    const config = getOAuthProviderConfig("facebook", {
      AUTH_FACEBOOK_CLIENT_ID: "client",
      AUTH_FACEBOOK_CLIENT_SECRET: "secret",
    });

    expect(config).toMatchObject({
      provider: "facebook",
      enabled: true,
      clientId: "client",
      clientSecret: "secret",
    });
  });

  it("keeps Apple disabled until id token verification is implemented", () => {
    const config = getOAuthProviderConfig("apple", {
      AUTH_APPLE_CLIENT_ID: "client",
      AUTH_APPLE_CLIENT_SECRET: "secret",
    });

    expect(config).toMatchObject({
      provider: "apple",
      enabled: false,
    });
    expect(config.disabledReason).toContain("id_token signature");
  });
});

describe("auth URLs", () => {
  it("uses configured canonical app URLs instead of request origin data", () => {
    expect(
      getAuthBaseUrl({
        NEXT_PUBLIC_SITE_URL: "https://qscm.example",
      }),
    ).toBe("https://qscm.example");
    expect(
      getAuthBaseUrl({
        AUTH_APP_URL: "https://auth.example/",
        NEXT_PUBLIC_SITE_URL: "https://qscm.example",
      }),
    ).toBe("https://auth.example");
  });

  it("builds magic-link token URLs from the canonical base URL", () => {
    expect(
      buildMagicLinkUrl({
        baseUrl: "https://qscm.example",
        token: "token_1",
        redirectTo: "/account",
      }),
    ).toBe("https://qscm.example/api/auth/magic-link/consume?token=token_1&redirectTo=%2Faccount");
  });

  it("round-trips OAuth state and rejects unsafe redirects", () => {
    const encoded = encodeOAuthState({
      state: "state_1",
      provider: "google",
      intent: "link",
      redirectTo: "/account",
    });

    expect(decodeOAuthState(encoded)).toEqual({
      state: "state_1",
      provider: "google",
      intent: "link",
      redirectTo: "/account",
    });
    expect(
      decodeOAuthState(
        encodeOAuthState({
          state: "state_1",
          provider: "google",
          intent: "sign_in",
          redirectTo: "//evil.example",
        }),
      ),
    ).toBeUndefined();
    expect(
      decodeOAuthState(
        encodeOAuthState({
          state: "state_1",
          provider: "google",
          intent: "sign_in",
          redirectTo: "/\\\\evil.example/path",
        }),
      ),
    ).toBeUndefined();
    expect(sanitizeInternalRedirect("/account")).toBe("/account");
    expect(sanitizeInternalRedirect("/%5cevil.example/path")).toBeUndefined();
  });
});

describe("RBAC guards", () => {
  it("defines the launch role set", () => {
    expect(launchAuthRoles).toEqual([
      "reader",
      "author",
      "editor",
      "moderator",
      "support",
      "admin",
    ]);
  });

  it("allows active users through matching role guards", () => {
    const editor = user({ roles: ["reader", "editor"] });

    expect(requireAuthRole(editor, "editor")).toBe(editor);
    expect(requireAnyAuthRole(editor, ["support", "editor"])).toBe(editor);
  });

  it("blocks disabled users even when the role is present", () => {
    expect(() =>
      requireAuthRole(
        user({
          roles: ["admin"],
          status: "disabled",
          disabledAt: now,
        }),
        "admin",
      ),
    ).toThrow("Authentication is required.");
  });

  it("protects the admin server surface from anonymous and non-admin users", () => {
    expect(authorizeAdminSurface(undefined)).toMatchObject({
      allowed: false,
      status: 401,
    });
    expect(authorizeAdminSurface(user())).toMatchObject({
      allowed: false,
      status: 403,
    });
    expect(authorizeAdminSurface(user({ roles: ["reader", "admin"] }))).toMatchObject({
      allowed: true,
      status: 200,
    });
  });
});
