import { describe, expect, it } from "vitest";
import {
  authSessionStatusForTime,
  canConsumeMagicLink,
  consumeMagicLinkRequest,
  decideOAuthAccountLink,
  hasAuthRole,
  InMemoryAuthRepository,
  normalizeAuthEmail,
  revokeMagicLinkRequest,
  type AuthAccount,
  type AuthSession,
  type AuthUser,
  type MagicLinkRequest,
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
