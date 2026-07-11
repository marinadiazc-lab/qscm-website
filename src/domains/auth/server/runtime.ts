import "server-only";

import { cookies } from "next/headers";

import { getSiteUrl, siteName } from "@/src/content/site";
import { db } from "@/src/db";
import { EmailProviderConfigurationError, EmailSendService, createResendEmailProviderFromEnv } from "@/src/domains/email";
import { DrizzleEmailSendIntentRepository } from "@/src/domains/email/repository";
import { getDefaultPublicationId } from "@/src/domains/subscribers/runtime";
import { DrizzleAuthRepository } from "../drizzle-repository";
import type { AuthAccount, AuthRepository, AuthSession, AuthUser } from "../index";
import {
  AUTH_SESSION_COOKIE,
  FetchOAuthProviderClient,
  OAuthProviderError,
  type OAuthProviderClient,
  accountLinkingRecordFromDecision,
  authAccountFromOAuthProfile,
  authSessionStatusForTime,
  buildMagicLinkUrl,
  createAuthId,
  createOpaqueToken,
  getAuthBaseUrl,
  getOAuthProviderConfig,
  hashAuthToken,
  magicLinkExpiresAt,
  normalizeAuthEmail,
  decideOAuthAccountLink,
  sanitizeInternalRedirect,
  sessionExpiresAt,
  type OAuthProvider,
} from "../index";
import { deliverMagicLinkEmail, type MagicLinkDeliveryResult } from "../magic-link-email";

export type AuthRuntime = {
  repository: AuthRepository;
};

export type RequestMagicLinkResult = {
  delivery: MagicLinkDeliveryResult;
};

export type ConsumeMagicLinkResult =
  | { status: "authenticated"; user: AuthUser; session: AuthSession }
  | { status: "invalid" | "expired" | "already_used"; message: string };

export type CompleteOAuthCallbackResult =
  | {
      status: "authenticated";
      user: AuthUser;
      session: AuthSession;
      account: AuthAccount;
    }
  | { status: "linked" | "already_linked"; user: AuthUser; account: AuthAccount }
  | {
      status: "requires_confirmation" | "rejected" | "provider_error";
      reason: string;
      message: string;
    };

let repositoryPromise: Promise<AuthRepository> | undefined;

export async function getAuthRepository(): Promise<AuthRepository> {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required for auth sessions and account data.");
  }

  repositoryPromise ??= import("@/src/db").then(({ db }) => new DrizzleAuthRepository(db));

  return repositoryPromise;
}

export async function getOptionalAuthRepository(): Promise<AuthRepository | undefined> {
  if (!process.env.DATABASE_URL) {
    return undefined;
  }

  return getAuthRepository();
}

export async function getCurrentAuthSession(now = new Date()): Promise<
  | {
      user: AuthUser;
      session: AuthSession;
      accounts: AuthAccount[];
    }
  | undefined
> {
  const cookieStore = await cookies();
  const token = cookieStore.get(AUTH_SESSION_COOKIE)?.value;
  const repository = await getOptionalAuthRepository();

  if (!token || !repository?.findSessionByTokenHash) {
    return undefined;
  }

  const session = await repository.findSessionByTokenHash(hashAuthToken(token));

  if (!session || authSessionStatusForTime(session, now) !== "active") {
    return undefined;
  }

  const user = await repository.findUserById(session.userId);

  if (!user || user.status !== "active" || user.disabledAt) {
    return undefined;
  }

  return {
    user,
    session,
    accounts: await repository.listAccountsForUser(user.id),
  };
}

export async function requestMagicLink(input: {
  email: string;
  redirectTo?: string;
  baseUrl?: string;
  now?: Date;
}): Promise<RequestMagicLinkResult> {
  const repository = await getAuthRepository();
  const now = input.now ?? new Date();
  const email = normalizeAuthEmail(input.email);
  const token = createOpaqueToken();
  const request = await repository.saveMagicLinkRequest({
    id: createAuthId("magic"),
    email,
    tokenHash: hashAuthToken(token),
    status: "requested",
    requestedAt: now,
    expiresAt: magicLinkExpiresAt(now),
    redirectTo: sanitizeInternalRedirect(input.redirectTo),
  });
  const magicLinkUrl = buildMagicLinkUrl({
    baseUrl: input.baseUrl ?? getAuthBaseUrl(),
    token,
    redirectTo: request.redirectTo,
  });

  return {
    delivery: await deliverMagicLink({
      email,
      magicLinkUrl,
      requestId: request.id,
      requestedAt: request.requestedAt,
      expiresAt: request.expiresAt,
    }),
  };
}

export async function consumeMagicLinkToken(input: {
  token: string;
  now?: Date;
}): Promise<ConsumeMagicLinkResult> {
  const repository = await getAuthRepository();
  const now = input.now ?? new Date();
  const tokenHash = hashAuthToken(input.token);
  const request = await repository.claimMagicLinkRequest(tokenHash, now);

  if (!request) {
    const existingRequest = await repository.findMagicLinkRequestByTokenHash(tokenHash);

    if (!existingRequest) {
      return { status: "invalid", message: "That sign-in link is not valid." };
    }

    if (existingRequest.status === "requested" && existingRequest.expiresAt <= now) {
      await repository.updateMagicLinkRequestStatus(existingRequest.id, "expired", now);

      return { status: "expired", message: "That sign-in link has expired." };
    }

    return {
      status: "already_used",
      message: "That sign-in link has already been used.",
    };
  }

  const user = await findOrCreateMagicLinkUser(repository, request.email, now);
  const sessionToken = createOpaqueToken();
  const session = await repository.saveSession({
    id: createAuthId("session"),
    userId: user.id,
    tokenHash: hashAuthToken(sessionToken),
    status: "active",
    createdAt: now,
    expiresAt: sessionExpiresAt(now),
  });

  await repository.saveMagicLinkRequest({ ...request, userId: user.id, sessionId: session.id });
  await setSessionCookie(sessionToken, session.expiresAt);

  return { status: "authenticated", user, session };
}

export async function completeOAuthCallback(input: {
  provider: OAuthProvider;
  code: string;
  redirectUri: string;
  targetUser?: AuthUser;
  intent: "sign_in" | "link";
  now?: Date;
  client?: OAuthProviderClient;
}): Promise<CompleteOAuthCallbackResult> {
  const config = getOAuthProviderConfig(input.provider);

  if (!config.enabled) {
    return {
      status: "provider_error",
      reason: "provider_disabled",
      message: config.disabledReason ?? "That provider is not configured.",
    };
  }

  const repository = await getAuthRepository();
  const now = input.now ?? new Date();
  const client = input.client ?? new FetchOAuthProviderClient();

  try {
    const token = await client.exchangeCode({
      config,
      code: input.code,
      redirectUri: input.redirectUri,
    });
    const profile = await client.fetchProfile({ config, token });

    if (profile.provider !== input.provider) {
      return {
        status: "provider_error",
        reason: "provider_mismatch",
        message: "The OAuth provider returned an unexpected profile.",
      };
    }

    const existingAccount = await repository.findAccountByProvider(
      profile.provider,
      profile.providerAccountId,
    );
    const existingUserWithEmail = profile.email
      ? await repository.findUserByEmail(profile.email)
      : undefined;
    const decision = decideOAuthAccountLink({
      profile,
      targetUser: input.targetUser,
      existingAccount,
      existingUserWithEmail,
    });

    await repository.saveAccountLinkingRecord(
      accountLinkingRecordFromDecision({
        id: createAuthId("link"),
        decision,
        profile,
        createdAt: now,
        metadata: {
          intent: input.intent,
        },
      }),
    );

    if (decision.outcome === "reject") {
      return {
        status: "rejected",
        reason: decision.reason,
        message: decision.message,
      };
    }

    if (decision.outcome === "requires_confirmation") {
      return {
        status: "requires_confirmation",
        reason: decision.reason,
        message: decision.message,
      };
    }

    if (decision.outcome === "link") {
      const account = await repository.saveAccount(
        authAccountFromOAuthProfile({
          id: createAuthId("account"),
          userId: decision.targetUserId,
          profile,
          now,
        }),
      );
      const user = await repository.findUserById(decision.targetUserId);

      if (!user || user.status !== "active" || user.disabledAt) {
        return disabledUserResult();
      }

      return { status: "linked", user, account };
    }

    if (decision.outcome === "already_linked") {
      if (!existingAccount || existingAccount.status !== "active") {
        return {
          status: "rejected",
          reason: "provider_account_inactive",
          message: "This provider account cannot be used for sign-in.",
        };
      }

      const user = await repository.findUserById(decision.targetUserId);

      if (!user || user.status !== "active" || user.disabledAt) {
        return disabledUserResult();
      }

      const account = await repository.saveAccount({
        ...existingAccount,
        email: profile.email ? normalizeAuthEmail(profile.email) : existingAccount.email,
        emailVerifiedAt: profile.emailVerified ? now : existingAccount.emailVerifiedAt,
        displayName: profile.displayName ?? existingAccount.displayName,
        avatarUrl: profile.avatarUrl ?? existingAccount.avatarUrl,
        lastAuthenticatedAt: now,
        updatedAt: now,
      });

      if (input.targetUser) {
        return { status: "already_linked", user, account };
      }

      const session = await createAndSetSession(repository, user.id, now);

      return { status: "authenticated", user, session, account };
    }

    const user = await repository.saveUser({
      id: createAuthId("user"),
      email: decision.email,
      emailVerifiedAt: now,
      displayName: profile.displayName,
      avatarUrl: profile.avatarUrl,
      roles: ["reader"],
      status: "active",
      createdAt: now,
      updatedAt: now,
    });
    const account = await repository.saveAccount(
      authAccountFromOAuthProfile({
        id: createAuthId("account"),
        userId: user.id,
        profile,
        now,
      }),
    );
    const session = await createAndSetSession(repository, user.id, now);

    return { status: "authenticated", user, session, account };
  } catch (error) {
    if (error instanceof OAuthProviderError) {
      return {
        status: "provider_error",
        reason: error.code,
        message: error.message,
      };
    }

    throw error;
  }
}

export async function revokeCurrentSession(): Promise<void> {
  const cookieStore = await cookies();
  const token = cookieStore.get(AUTH_SESSION_COOKIE)?.value;
  const repository = await getOptionalAuthRepository();

  if (token && repository?.findSessionByTokenHash) {
    const session = await repository.findSessionByTokenHash(hashAuthToken(token));

    if (session) {
      await repository.revokeSession(session.id, new Date());
    }
  }

  cookieStore.delete(AUTH_SESSION_COOKIE);
}

async function findOrCreateMagicLinkUser(
  repository: AuthRepository,
  email: string,
  now: Date,
): Promise<AuthUser> {
  const existingUser = await repository.findUserByEmail(email);

  if (existingUser) {
    await ensureEmailMagicLinkAccount(repository, existingUser, now);
    return existingUser;
  }

  const user: AuthUser = await repository.saveUser({
    id: createAuthId("user"),
    email,
    emailVerifiedAt: now,
    roles: ["reader"],
    status: "active",
    createdAt: now,
    updatedAt: now,
  });

  await ensureEmailMagicLinkAccount(repository, user, now);

  return user;
}

async function ensureEmailMagicLinkAccount(
  repository: AuthRepository,
  user: AuthUser,
  now: Date,
): Promise<AuthAccount> {
  const existingAccount = await repository.findAccountByProvider("email_magic_link", user.email);

  if (existingAccount) {
    return repository.saveAccount({
      ...existingAccount,
      lastAuthenticatedAt: now,
      updatedAt: now,
    });
  }

  return repository.saveAccount({
    id: createAuthId("account"),
    userId: user.id,
    provider: "email_magic_link",
    providerAccountId: user.email,
    email: user.email,
    emailVerifiedAt: user.emailVerifiedAt ?? now,
    status: "active",
    linkedAt: now,
    lastAuthenticatedAt: now,
    createdAt: now,
    updatedAt: now,
  });
}

async function createAndSetSession(
  repository: AuthRepository,
  userId: string,
  now: Date,
): Promise<AuthSession> {
  const sessionToken = createOpaqueToken();
  const session = await repository.saveSession({
    id: createAuthId("session"),
    userId,
    tokenHash: hashAuthToken(sessionToken),
    status: "active",
    createdAt: now,
    expiresAt: sessionExpiresAt(now),
  });

  await setSessionCookie(sessionToken, session.expiresAt);

  return session;
}

function disabledUserResult(): CompleteOAuthCallbackResult {
  return {
    status: "rejected",
    reason: "disabled_user",
    message: "This account is disabled.",
  };
}

async function setSessionCookie(token: string, expiresAt: Date): Promise<void> {
  const cookieStore = await cookies();

  cookieStore.set(AUTH_SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });
}

async function deliverMagicLink(input: {
  email: string;
  magicLinkUrl: string;
  requestId: string;
  requestedAt: Date;
  expiresAt: Date;
}): Promise<MagicLinkDeliveryResult> {
  if (!hasTransactionalEmailConfig()) {
    return {
      status: "not_configured",
      message: `${siteName} created a magic-link request, but transactional email delivery is not configured for this environment.`,
    };
  }

  try {
    return await deliverMagicLinkEmail({
      email: input.email,
      magicLinkUrl: input.magicLinkUrl,
      requestId: input.requestId,
      publicationId: await getDefaultPublicationId(),
      siteName,
      siteUrl: getSiteUrl(),
      requestedAt: input.requestedAt,
      expiresAt: input.expiresAt,
      sendService: createMagicLinkSendService(),
    });
  } catch (error) {
    if (error instanceof EmailProviderConfigurationError) {
      return {
        status: "not_configured",
        message: error.message,
      };
    }

    return {
      status: "failed",
      message: error instanceof Error ? error.message : "Magic-link email delivery failed.",
    };
  }
}

function createMagicLinkSendService() {
  return new EmailSendService(
    new DrizzleEmailSendIntentRepository(db),
    createResendEmailProviderFromEnv(),
  );
}

function hasTransactionalEmailConfig(env: NodeJS.ProcessEnv = process.env) {
  return Boolean(env.RESEND_API_KEY?.trim() && env.RESEND_DEFAULT_FROM?.trim());
}
