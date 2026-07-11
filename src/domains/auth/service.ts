import type {
  AccountLinkingRecord,
  AccountLinkingDecision,
  AuthAccount,
  AuthProvider,
  AuthRole,
  AuthSession,
  AuthSessionId,
  AuthSessionStatus,
  AuthUser,
  MagicLinkRequest,
  MagicLinkRequestStatus,
  OAuthProvider,
  OAuthProviderProfile,
} from "./types";

export const launchAuthRoles = [
  "reader",
  "author",
  "editor",
  "moderator",
  "support",
  "admin",
] as const satisfies readonly AuthRole[];

const oauthProviders = ["google", "facebook", "apple"] as const satisfies readonly OAuthProvider[];

export interface DecideOAuthAccountLinkInput {
  profile: OAuthProviderProfile;
  targetUser?: AuthUser;
  existingAccount?: AuthAccount;
  existingUserWithEmail?: AuthUser;
}

export function isOAuthProvider(
  provider: AuthProvider,
): provider is OAuthProvider {
  return provider !== "email_magic_link";
}

export function parseOAuthProvider(provider: string): OAuthProvider | undefined {
  return oauthProviders.find((candidate) => candidate === provider);
}

export function normalizeAuthEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function decideOAuthAccountLink(
  input: DecideOAuthAccountLinkInput,
): AccountLinkingDecision {
  const { existingAccount, existingUserWithEmail, profile, targetUser } = input;
  const providerAccountId = profile.providerAccountId;
  const email = profile.email ? normalizeAuthEmail(profile.email) : undefined;
  const targetEmail = targetUser
    ? normalizeAuthEmail(targetUser.email)
    : undefined;

  if (existingAccount) {
    if (targetUser && existingAccount.userId === targetUser.id) {
      return {
        outcome: "already_linked",
        reason: "provider_account_already_linked",
        provider: profile.provider,
        providerAccountId,
        accountId: existingAccount.id,
        targetUserId: targetUser.id,
        message: "This provider account is already linked to the user.",
      };
    }

    if (!targetUser) {
      return {
        outcome: "already_linked",
        reason: "provider_account_already_linked",
        provider: profile.provider,
        providerAccountId,
        accountId: existingAccount.id,
        targetUserId: existingAccount.userId,
        message: "This provider account is already linked to a user.",
      };
    }

    return {
      outcome: "reject",
      reason: "provider_account_conflict",
      provider: profile.provider,
      providerAccountId,
      accountId: existingAccount.id,
      existingUserId: existingAccount.userId,
      targetUserId: targetUser?.id,
      message: "This provider account is already linked to another user.",
    };
  }

  if (targetUser) {
    if (!email) {
      return {
        outcome: "reject",
        reason: "missing_email",
        provider: profile.provider,
        providerAccountId,
        targetUserId: targetUser.id,
        message: "The provider did not return an email address for linking.",
      };
    }

    if (!profile.emailVerified) {
      return {
        outcome: "requires_confirmation",
        reason: "unverified_email_requires_confirmation",
        provider: profile.provider,
        providerAccountId,
        targetUserId: targetUser.id,
        email,
        message:
          "The provider email is unverified, so linking requires an explicit confirmation step.",
      };
    }

    if (email !== targetEmail) {
      return {
        outcome: "requires_confirmation",
        reason: "email_mismatch_requires_confirmation",
        provider: profile.provider,
        providerAccountId,
        targetUserId: targetUser.id,
        email,
        message:
          "The provider email does not match the signed-in user email, so linking requires confirmation.",
      };
    }

    return {
      outcome: "link",
      reason: "explicit_verified_email_match",
      provider: profile.provider,
      providerAccountId,
      targetUserId: targetUser.id,
      message: "The verified provider email matches the signed-in user.",
    };
  }

  if (!email) {
    return {
      outcome: "reject",
      reason: "missing_email",
      provider: profile.provider,
      providerAccountId,
      message:
        "The provider did not return an email address, and there is no signed-in user to link.",
    };
  }

  if (!profile.emailVerified) {
    return {
      outcome: "requires_confirmation",
      reason: "unverified_email_requires_confirmation",
      provider: profile.provider,
      providerAccountId,
      existingUserId: existingUserWithEmail?.id,
      email,
      message:
        "The provider email is unverified, so the user must confirm ownership before continuing.",
    };
  }

  if (existingUserWithEmail) {
    return {
      outcome: "requires_confirmation",
      reason: "verified_email_match_requires_confirmation",
      provider: profile.provider,
      providerAccountId,
      existingUserId: existingUserWithEmail.id,
      email,
      message:
        "A user already exists for this verified email; do not merge silently.",
    };
  }

  return {
    outcome: "create_user",
    reason: "new_verified_email",
    provider: profile.provider,
    providerAccountId,
    email,
    message:
      "No existing user or provider account was found for this verified email.",
  };
}

export function accountLinkingRecordFromDecision(input: {
  id: string;
  decision: AccountLinkingDecision;
  profile: OAuthProviderProfile;
  createdAt: Date;
  metadata?: Record<string, string | number | boolean | null | undefined>;
}): AccountLinkingRecord {
  return {
    id: input.id,
    userId:
      "targetUserId" in input.decision
        ? input.decision.targetUserId
        : "existingUserId" in input.decision
          ? input.decision.existingUserId
          : undefined,
    provider: input.decision.provider,
    providerAccountId: input.decision.providerAccountId,
    email: input.profile.email ? normalizeAuthEmail(input.profile.email) : undefined,
    decisionOutcome: input.decision.outcome,
    decisionReason: input.decision.reason,
    metadata: cleanAuthMetadata({
      message: input.decision.message,
      accountId: "accountId" in input.decision ? input.decision.accountId : undefined,
      targetUserId:
        "targetUserId" in input.decision ? input.decision.targetUserId : undefined,
      existingUserId:
        "existingUserId" in input.decision ? input.decision.existingUserId : undefined,
      displayName: input.profile.displayName,
      ...input.metadata,
    }),
    createdAt: input.createdAt,
  };
}

export function authAccountFromOAuthProfile(input: {
  id: string;
  userId: string;
  profile: OAuthProviderProfile;
  now: Date;
}): AuthAccount {
  return {
    id: input.id,
    userId: input.userId,
    provider: input.profile.provider,
    providerAccountId: input.profile.providerAccountId,
    email: input.profile.email ? normalizeAuthEmail(input.profile.email) : undefined,
    emailVerifiedAt: input.profile.emailVerified ? input.now : undefined,
    displayName: input.profile.displayName,
    avatarUrl: input.profile.avatarUrl,
    status: "active",
    linkedAt: input.now,
    lastAuthenticatedAt: input.now,
    createdAt: input.now,
    updatedAt: input.now,
    metadata: input.profile.metadata,
  };
}

function cleanAuthMetadata(
  value: Record<string, string | number | boolean | null | undefined>,
) {
  return Object.fromEntries(
    Object.entries(value).filter(
      (entry): entry is [string, string | number | boolean | null] =>
        entry[1] !== undefined,
    ),
  );
}

export function hasAuthRole(user: AuthUser, role: AuthRole): boolean {
  return isActiveUser(user) && user.roles.includes(role);
}

export function hasAnyAuthRole(
  user: AuthUser,
  roles: readonly AuthRole[],
): boolean {
  return isActiveUser(user) && roles.some((role) => user.roles.includes(role));
}

export function isAdminUser(user: AuthUser): boolean {
  return hasAuthRole(user, "admin");
}

export function isActiveUser(user: AuthUser): boolean {
  return user.status === "active" && !user.disabledAt;
}

export function authSessionStatusForTime(
  session: AuthSession,
  now: Date,
): AuthSessionStatus {
  if (session.status === "revoked" || session.revokedAt) {
    return "revoked";
  }

  if (session.expiresAt.getTime() <= now.getTime()) {
    return "expired";
  }

  return "active";
}

export function magicLinkStatusForTime(
  request: MagicLinkRequest,
  now: Date,
): MagicLinkRequestStatus {
  if (request.status !== "requested") {
    return request.status;
  }

  return request.expiresAt.getTime() <= now.getTime() ? "expired" : "requested";
}

export function canConsumeMagicLink(
  request: MagicLinkRequest,
  now: Date,
): boolean {
  return magicLinkStatusForTime(request, now) === "requested";
}

export function consumeMagicLinkRequest(
  request: MagicLinkRequest,
  consumedAt: Date,
  sessionId?: AuthSessionId,
): MagicLinkRequest {
  if (!canConsumeMagicLink(request, consumedAt)) {
    return {
      ...request,
      status: magicLinkStatusForTime(request, consumedAt),
    };
  }

  return {
    ...request,
    status: "consumed",
    consumedAt,
    sessionId,
  };
}

export function revokeMagicLinkRequest(
  request: MagicLinkRequest,
  revokedAt: Date,
): MagicLinkRequest {
  if (request.status === "consumed") {
    return request;
  }

  return {
    ...request,
    status: "revoked",
    revokedAt,
  };
}
