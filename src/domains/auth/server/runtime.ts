import "server-only";

import { cookies } from "next/headers";

import { siteName } from "@/src/content/site";
import { DrizzleAuthRepository } from "../drizzle-repository";
import type { AuthAccount, AuthRepository, AuthSession, AuthUser } from "../index";
import {
  AUTH_SESSION_COOKIE,
  authSessionStatusForTime,
  canConsumeMagicLink,
  consumeMagicLinkRequest,
  createAuthId,
  createOpaqueToken,
  hashAuthToken,
  magicLinkExpiresAt,
  normalizeAuthEmail,
  sessionExpiresAt,
} from "../index";

export type AuthRuntime = {
  repository: AuthRepository;
};

export type MagicLinkDeliveryResult =
  | { status: "queued"; provider: string }
  | { status: "not_configured"; message: string };

export type RequestMagicLinkResult = {
  delivery: MagicLinkDeliveryResult;
};

export type ConsumeMagicLinkResult =
  | { status: "authenticated"; user: AuthUser; session: AuthSession }
  | { status: "invalid" | "expired" | "already_used"; message: string };

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
  baseUrl: string;
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
    redirectTo: sanitizeRedirect(input.redirectTo),
  });
  const magicLinkUrl = new URL("/api/auth/magic-link/consume", input.baseUrl);
  magicLinkUrl.searchParams.set("token", token);

  if (request.redirectTo) {
    magicLinkUrl.searchParams.set("redirectTo", request.redirectTo);
  }

  return {
    delivery: await deliverMagicLink({
      email,
      magicLinkUrl: magicLinkUrl.toString(),
      requestId: request.id,
    }),
  };
}

export async function consumeMagicLinkToken(input: {
  token: string;
  now?: Date;
}): Promise<ConsumeMagicLinkResult> {
  const repository = await getAuthRepository();
  const now = input.now ?? new Date();
  const request = await repository.findMagicLinkRequestByTokenHash(hashAuthToken(input.token));

  if (!request) {
    return { status: "invalid", message: "That sign-in link is not valid." };
  }

  if (!canConsumeMagicLink(request, now)) {
    const status = request.status === "requested" ? "expired" : "already_used";

    if (status === "expired") {
      await repository.updateMagicLinkRequestStatus(request.id, "expired", now);
    }

    return {
      status,
      message:
        status === "expired"
          ? "That sign-in link has expired."
          : "That sign-in link has already been used.",
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
  const consumed = consumeMagicLinkRequest(request, now, session.id);

  await repository.saveMagicLinkRequest({ ...consumed, userId: user.id });
  await setSessionCookie(sessionToken, session.expiresAt);

  return { status: "authenticated", user, session };
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
}): Promise<MagicLinkDeliveryResult> {
  void input;

  return {
    status: "not_configured",
    message: `${siteName} created a magic-link request, but transactional email delivery is not wired yet.`,
  };
}

function sanitizeRedirect(redirectTo?: string): string | undefined {
  if (!redirectTo || !redirectTo.startsWith("/") || redirectTo.startsWith("//")) {
    return undefined;
  }

  return redirectTo;
}
