import { and, eq, sql } from "drizzle-orm";

import type { DbClient } from "@/src/db";
import * as schema from "@/src/db/schema";
import type {
  AuthAccount,
  AuthProvider,
  AuthProviderAccountId,
  AuthSession,
  AuthSessionId,
  AuthUser,
  AuthUserId,
  MagicLinkRequest,
  MagicLinkRequestId,
  MagicLinkRequestStatus,
  MagicLinkTokenHash,
} from "./types";
import type { AuthRepository } from "./repository";
import { normalizeAuthEmail } from "./service";

export class DrizzleAuthRepository implements AuthRepository {
  constructor(private readonly db: DbClient) {}

  async saveUser(user: AuthUser): Promise<AuthUser> {
    const [row] = await this.db
      .insert(schema.users)
      .values(toUserRow(user))
      .onConflictDoUpdate({
        target: schema.users.id,
        set: toUserRow(user),
      })
      .returning();

    await this.db.delete(schema.userRoles).where(eq(schema.userRoles.userId, user.id));

    if (user.roles.length > 0) {
      await this.db.insert(schema.userRoles).values(
        user.roles.map((role) => ({
          userId: user.id,
          role,
        })),
      );
    }

    return this.userFromRow(row, user.roles);
  }

  async findUserById(id: AuthUserId): Promise<AuthUser | undefined> {
    const [row] = await this.db.select().from(schema.users).where(eq(schema.users.id, id)).limit(1);

    return row ? this.userFromRow(row, await this.rolesForUser(row.id)) : undefined;
  }

  async findUserByEmail(email: string): Promise<AuthUser | undefined> {
    const [row] = await this.db
      .select()
      .from(schema.users)
      .where(sql`lower(${schema.users.email}) = ${normalizeAuthEmail(email)}`)
      .limit(1);

    return row ? this.userFromRow(row, await this.rolesForUser(row.id)) : undefined;
  }

  async listUsers(): Promise<AuthUser[]> {
    const rows = await this.db.select().from(schema.users).orderBy(schema.users.createdAt);

    return Promise.all(rows.map(async (row) => this.userFromRow(row, await this.rolesForUser(row.id))));
  }

  async saveAccount(account: AuthAccount): Promise<AuthAccount> {
    const [row] = await this.db
      .insert(schema.authAccounts)
      .values(toAccountRow(account))
      .onConflictDoUpdate({
        target: schema.authAccounts.id,
        set: toAccountRow(account),
      })
      .returning();

    return accountFromRow(row);
  }

  async findAccountById(id: string): Promise<AuthAccount | undefined> {
    const [row] = await this.db
      .select()
      .from(schema.authAccounts)
      .where(eq(schema.authAccounts.id, id))
      .limit(1);

    return row ? accountFromRow(row) : undefined;
  }

  async findAccountByProvider(
    provider: AuthProvider,
    providerAccountId: AuthProviderAccountId,
  ): Promise<AuthAccount | undefined> {
    const [row] = await this.db
      .select()
      .from(schema.authAccounts)
      .where(
        and(
          eq(schema.authAccounts.provider, provider),
          eq(schema.authAccounts.providerAccountId, providerAccountId),
        ),
      )
      .limit(1);

    return row ? accountFromRow(row) : undefined;
  }

  async listAccountsForUser(userId: AuthUserId): Promise<AuthAccount[]> {
    const rows = await this.db
      .select()
      .from(schema.authAccounts)
      .where(eq(schema.authAccounts.userId, userId))
      .orderBy(schema.authAccounts.linkedAt);

    return rows.map(accountFromRow);
  }

  async saveSession(session: AuthSession): Promise<AuthSession> {
    const [row] = await this.db
      .insert(schema.authSessions)
      .values(toSessionRow(session))
      .onConflictDoUpdate({
        target: schema.authSessions.id,
        set: toSessionRow(session),
      })
      .returning();

    return sessionFromRow(row);
  }

  async findSessionById(id: AuthSessionId): Promise<AuthSession | undefined> {
    const [row] = await this.db
      .select()
      .from(schema.authSessions)
      .where(eq(schema.authSessions.id, id))
      .limit(1);

    return row ? sessionFromRow(row) : undefined;
  }

  async findSessionByTokenHash(tokenHash: string): Promise<AuthSession | undefined> {
    const [row] = await this.db
      .select()
      .from(schema.authSessions)
      .where(eq(schema.authSessions.tokenHash, tokenHash))
      .limit(1);

    return row ? sessionFromRow(row) : undefined;
  }

  async listSessionsForUser(userId: AuthUserId): Promise<AuthSession[]> {
    const rows = await this.db
      .select()
      .from(schema.authSessions)
      .where(eq(schema.authSessions.userId, userId))
      .orderBy(schema.authSessions.createdAt);

    return rows.map(sessionFromRow).reverse();
  }

  async revokeSession(id: AuthSessionId, revokedAt: Date): Promise<AuthSession | undefined> {
    const [row] = await this.db
      .update(schema.authSessions)
      .set({ status: "revoked", revokedAt })
      .where(eq(schema.authSessions.id, id))
      .returning();

    return row ? sessionFromRow(row) : undefined;
  }

  async saveMagicLinkRequest(request: MagicLinkRequest): Promise<MagicLinkRequest> {
    const [row] = await this.db
      .insert(schema.magicLinkRequests)
      .values(toMagicLinkRow(request))
      .onConflictDoUpdate({
        target: schema.magicLinkRequests.id,
        set: toMagicLinkRow(request),
      })
      .returning();

    return magicLinkFromRow(row);
  }

  async findMagicLinkRequestById(
    id: MagicLinkRequestId,
  ): Promise<MagicLinkRequest | undefined> {
    const [row] = await this.db
      .select()
      .from(schema.magicLinkRequests)
      .where(eq(schema.magicLinkRequests.id, id))
      .limit(1);

    return row ? magicLinkFromRow(row) : undefined;
  }

  async findMagicLinkRequestByTokenHash(
    tokenHash: MagicLinkTokenHash,
  ): Promise<MagicLinkRequest | undefined> {
    const [row] = await this.db
      .select()
      .from(schema.magicLinkRequests)
      .where(eq(schema.magicLinkRequests.tokenHash, tokenHash))
      .limit(1);

    return row ? magicLinkFromRow(row) : undefined;
  }

  async listMagicLinkRequestsForEmail(email: string): Promise<MagicLinkRequest[]> {
    const rows = await this.db
      .select()
      .from(schema.magicLinkRequests)
      .where(sql`lower(${schema.magicLinkRequests.email}) = ${normalizeAuthEmail(email)}`)
      .orderBy(schema.magicLinkRequests.requestedAt);

    return rows.map(magicLinkFromRow).reverse();
  }

  async updateMagicLinkRequestStatus(
    id: MagicLinkRequestId,
    status: MagicLinkRequestStatus,
    changedAt: Date,
  ): Promise<MagicLinkRequest | undefined> {
    const [row] = await this.db
      .update(schema.magicLinkRequests)
      .set({
        status,
        consumedAt: status === "consumed" ? changedAt : undefined,
        revokedAt: status === "revoked" ? changedAt : undefined,
      })
      .where(eq(schema.magicLinkRequests.id, id))
      .returning();

    return row ? magicLinkFromRow(row) : undefined;
  }

  private async rolesForUser(userId: AuthUserId): Promise<AuthUser["roles"]> {
    const rows = await this.db
      .select({ role: schema.userRoles.role })
      .from(schema.userRoles)
      .where(eq(schema.userRoles.userId, userId));

    return rows.map((row) => row.role);
  }

  private userFromRow(row: typeof schema.users.$inferSelect, roles: AuthUser["roles"]): AuthUser {
    return {
      id: row.id,
      email: row.email,
      emailVerifiedAt: row.emailVerifiedAt ?? undefined,
      displayName: row.displayName ?? undefined,
      avatarUrl: row.avatarUrl ?? undefined,
      roles,
      status: row.status,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      disabledAt: row.disabledAt ?? undefined,
      metadata: authMetadata(row.metadata),
    };
  }
}

function toUserRow(user: AuthUser): typeof schema.users.$inferInsert {
  return {
    id: user.id,
    email: normalizeAuthEmail(user.email),
    emailVerifiedAt: user.emailVerifiedAt,
    displayName: user.displayName,
    avatarUrl: user.avatarUrl,
    status: user.status,
    disabledAt: user.disabledAt,
    metadata: user.metadata ?? {},
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

function toAccountRow(account: AuthAccount): typeof schema.authAccounts.$inferInsert {
  return {
    id: account.id,
    userId: account.userId,
    provider: account.provider,
    providerAccountId: account.providerAccountId,
    email: account.email ? normalizeAuthEmail(account.email) : undefined,
    emailVerifiedAt: account.emailVerifiedAt,
    displayName: account.displayName,
    avatarUrl: account.avatarUrl,
    status: account.status,
    linkedAt: account.linkedAt,
    lastAuthenticatedAt: account.lastAuthenticatedAt,
    unlinkedAt: account.unlinkedAt,
    metadata: account.metadata ?? {},
    createdAt: account.createdAt,
    updatedAt: account.updatedAt,
  };
}

function accountFromRow(row: typeof schema.authAccounts.$inferSelect): AuthAccount {
  return {
    id: row.id,
    userId: row.userId,
    provider: row.provider,
    providerAccountId: row.providerAccountId,
    email: row.email ?? undefined,
    emailVerifiedAt: row.emailVerifiedAt ?? undefined,
    displayName: row.displayName ?? undefined,
    avatarUrl: row.avatarUrl ?? undefined,
    status: row.status,
    linkedAt: row.linkedAt,
    lastAuthenticatedAt: row.lastAuthenticatedAt ?? undefined,
    unlinkedAt: row.unlinkedAt ?? undefined,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    metadata: authMetadata(row.metadata),
  };
}

function toSessionRow(session: AuthSession): typeof schema.authSessions.$inferInsert {
  return {
    id: session.id,
    userId: session.userId,
    tokenHash: session.tokenHash,
    status: session.status,
    requestContext: toRequestContextRow(session.requestContext),
    createdAt: session.createdAt,
    expiresAt: session.expiresAt,
    lastSeenAt: session.lastSeenAt,
    revokedAt: session.revokedAt,
  };
}

function sessionFromRow(row: typeof schema.authSessions.$inferSelect): AuthSession {
  return {
    id: row.id,
    userId: row.userId,
    tokenHash: row.tokenHash,
    status: row.status,
    createdAt: row.createdAt,
    expiresAt: row.expiresAt,
    lastSeenAt: row.lastSeenAt ?? undefined,
    revokedAt: row.revokedAt ?? undefined,
    requestContext: requestContext(row.requestContext),
  };
}

function toMagicLinkRow(
  request: MagicLinkRequest,
): typeof schema.magicLinkRequests.$inferInsert {
  return {
    id: request.id,
    email: normalizeAuthEmail(request.email),
    tokenHash: request.tokenHash,
    status: request.status,
    requestedAt: request.requestedAt,
    expiresAt: request.expiresAt,
    consumedAt: request.consumedAt,
    revokedAt: request.revokedAt,
    userId: request.userId,
    sessionId: request.sessionId,
    redirectTo: request.redirectTo,
    requestContext: toRequestContextRow(request.requestContext),
  };
}

function magicLinkFromRow(row: typeof schema.magicLinkRequests.$inferSelect): MagicLinkRequest {
  return {
    id: row.id,
    email: row.email,
    tokenHash: row.tokenHash,
    status: row.status,
    requestedAt: row.requestedAt,
    expiresAt: row.expiresAt,
    consumedAt: row.consumedAt ?? undefined,
    revokedAt: row.revokedAt ?? undefined,
    userId: row.userId ?? undefined,
    sessionId: row.sessionId ?? undefined,
    redirectTo: row.redirectTo ?? undefined,
    requestContext: requestContext(row.requestContext),
  };
}

function authMetadata(value: Record<string, unknown>): AuthUser["metadata"] {
  return Object.fromEntries(
    Object.entries(value).filter((entry): entry is [string, string | number | boolean | null] => {
      const candidate = entry[1];
      return (
        candidate === null ||
        typeof candidate === "string" ||
        typeof candidate === "number" ||
        typeof candidate === "boolean"
      );
    }),
  );
}

function requestContext(value: Record<string, unknown> | null): AuthSession["requestContext"] {
  if (!value) {
    return undefined;
  }

  return {
    ipHash: typeof value.ipHash === "string" ? value.ipHash : undefined,
    userAgentHash:
      typeof value.userAgentHash === "string" ? value.userAgentHash : undefined,
    sessionIdHash:
      typeof value.sessionIdHash === "string" ? value.sessionIdHash : undefined,
  };
}

function toRequestContextRow(
  value: AuthSession["requestContext"],
): Record<string, unknown> | undefined {
  if (!value) {
    return undefined;
  }

  return {
    ...(value.ipHash ? { ipHash: value.ipHash } : {}),
    ...(value.userAgentHash ? { userAgentHash: value.userAgentHash } : {}),
    ...(value.sessionIdHash ? { sessionIdHash: value.sessionIdHash } : {}),
  };
}
