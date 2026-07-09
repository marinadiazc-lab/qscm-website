export type AuthUserId = string;
export type AuthAccountId = string;
export type AuthSessionId = string;
export type MagicLinkRequestId = string;
export type AuthProviderAccountId = string;
export type AuthEmailAddress = string;
export type MagicLinkTokenHash = string;

export type AuthProvider =
  | "google"
  | "facebook"
  | "apple"
  | "email_magic_link";

export type OAuthProvider = Exclude<AuthProvider, "email_magic_link">;

export type AuthRole = "reader" | "author" | "admin";

export type AuthUserStatus = "active" | "disabled";

export type AuthAccountStatus = "active" | "disabled" | "unlinked";

export type AuthSessionStatus = "active" | "expired" | "revoked";

export type MagicLinkRequestStatus =
  | "requested"
  | "consumed"
  | "expired"
  | "revoked";

export type AuthMetadataValue = string | number | boolean | null;
export type AuthMetadata = Record<string, AuthMetadataValue>;

export interface AuthRequestContext {
  ipHash?: string;
  userAgentHash?: string;
  sessionIdHash?: string;
}

export interface AuthUser {
  id: AuthUserId;
  email: AuthEmailAddress;
  emailVerifiedAt?: Date;
  displayName?: string;
  avatarUrl?: string;
  roles: AuthRole[];
  status: AuthUserStatus;
  createdAt: Date;
  updatedAt: Date;
  disabledAt?: Date;
  metadata?: AuthMetadata;
}

export interface OAuthProviderProfile {
  provider: OAuthProvider;
  providerAccountId: AuthProviderAccountId;
  email?: AuthEmailAddress;
  emailVerified: boolean;
  displayName?: string;
  avatarUrl?: string;
  metadata?: AuthMetadata;
}

export interface AuthAccount {
  id: AuthAccountId;
  userId: AuthUserId;
  provider: AuthProvider;
  providerAccountId: AuthProviderAccountId;
  email?: AuthEmailAddress;
  emailVerifiedAt?: Date;
  displayName?: string;
  avatarUrl?: string;
  status: AuthAccountStatus;
  linkedAt: Date;
  lastAuthenticatedAt?: Date;
  unlinkedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
  metadata?: AuthMetadata;
}

export interface AuthSession {
  id: AuthSessionId;
  userId: AuthUserId;
  tokenHash: string;
  status: AuthSessionStatus;
  createdAt: Date;
  expiresAt: Date;
  lastSeenAt?: Date;
  revokedAt?: Date;
  requestContext?: AuthRequestContext;
}

export interface MagicLinkRequest {
  id: MagicLinkRequestId;
  email: AuthEmailAddress;
  tokenHash: MagicLinkTokenHash;
  status: MagicLinkRequestStatus;
  requestedAt: Date;
  expiresAt: Date;
  consumedAt?: Date;
  revokedAt?: Date;
  userId?: AuthUserId;
  sessionId?: AuthSessionId;
  redirectTo?: string;
  requestContext?: AuthRequestContext;
}

export type AccountLinkingDecisionOutcome =
  | "link"
  | "already_linked"
  | "requires_confirmation"
  | "create_user"
  | "reject";

export type AccountLinkingDecisionReason =
  | "explicit_verified_email_match"
  | "provider_account_already_linked"
  | "provider_account_conflict"
  | "verified_email_match_requires_confirmation"
  | "unverified_email_requires_confirmation"
  | "email_mismatch_requires_confirmation"
  | "missing_email"
  | "new_verified_email";

export interface AccountLinkingDecisionBase {
  outcome: AccountLinkingDecisionOutcome;
  reason: AccountLinkingDecisionReason;
  provider: OAuthProvider;
  providerAccountId: AuthProviderAccountId;
  message: string;
}

export interface LinkAccountDecision extends AccountLinkingDecisionBase {
  outcome: "link";
  reason: "explicit_verified_email_match";
  targetUserId: AuthUserId;
}

export interface AlreadyLinkedAccountDecision
  extends AccountLinkingDecisionBase {
  outcome: "already_linked";
  reason: "provider_account_already_linked";
  accountId: AuthAccountId;
  targetUserId: AuthUserId;
}

export interface RequiresConfirmationAccountLinkingDecision
  extends AccountLinkingDecisionBase {
  outcome: "requires_confirmation";
  reason:
    | "verified_email_match_requires_confirmation"
    | "unverified_email_requires_confirmation"
    | "email_mismatch_requires_confirmation";
  targetUserId?: AuthUserId;
  existingUserId?: AuthUserId;
  email?: AuthEmailAddress;
}

export interface CreateUserAccountLinkingDecision
  extends AccountLinkingDecisionBase {
  outcome: "create_user";
  reason: "new_verified_email";
  email: AuthEmailAddress;
}

export interface RejectAccountLinkingDecision
  extends AccountLinkingDecisionBase {
  outcome: "reject";
  reason: "provider_account_conflict" | "missing_email";
  accountId?: AuthAccountId;
  existingUserId?: AuthUserId;
  targetUserId?: AuthUserId;
}

export type AccountLinkingDecision =
  | LinkAccountDecision
  | AlreadyLinkedAccountDecision
  | RequiresConfirmationAccountLinkingDecision
  | CreateUserAccountLinkingDecision
  | RejectAccountLinkingDecision;
