import type {
  AccountLinkingRecord,
  AuthAccount,
  AuthAccountId,
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

export interface AuthRepository {
  saveUser(user: AuthUser): AuthUser | Promise<AuthUser>;
  findUserById(id: AuthUserId): AuthUser | undefined | Promise<AuthUser | undefined>;
  findUserByEmail(email: string): AuthUser | undefined | Promise<AuthUser | undefined>;
  listUsers(): AuthUser[] | Promise<AuthUser[]>;
  saveAccount(account: AuthAccount): AuthAccount | Promise<AuthAccount>;
  saveAccountForActiveUser?(
    account: AuthAccount,
  ): AuthAccount | undefined | Promise<AuthAccount | undefined>;
  findAccountById(id: AuthAccountId): AuthAccount | undefined | Promise<AuthAccount | undefined>;
  findAccountByProvider(
    provider: AuthProvider,
    providerAccountId: AuthProviderAccountId,
  ): AuthAccount | undefined | Promise<AuthAccount | undefined>;
  listAccountsForUser(userId: AuthUserId): AuthAccount[] | Promise<AuthAccount[]>;
  saveSession(session: AuthSession): AuthSession | Promise<AuthSession>;
  saveSessionForActiveUser?(
    session: AuthSession,
  ): AuthSession | undefined | Promise<AuthSession | undefined>;
  findSessionById(id: AuthSessionId): AuthSession | undefined | Promise<AuthSession | undefined>;
  findSessionByTokenHash?(tokenHash: string): AuthSession | undefined | Promise<AuthSession | undefined>;
  listSessionsForUser(userId: AuthUserId): AuthSession[] | Promise<AuthSession[]>;
  revokeSession(
    id: AuthSessionId,
    revokedAt: Date,
  ): AuthSession | undefined | Promise<AuthSession | undefined>;
  saveMagicLinkRequest(request: MagicLinkRequest): MagicLinkRequest | Promise<MagicLinkRequest>;
  findMagicLinkRequestById(
    id: MagicLinkRequestId,
  ): MagicLinkRequest | undefined | Promise<MagicLinkRequest | undefined>;
  findMagicLinkRequestByTokenHash(
    tokenHash: MagicLinkTokenHash,
  ): MagicLinkRequest | undefined | Promise<MagicLinkRequest | undefined>;
  claimMagicLinkRequest(
    tokenHash: MagicLinkTokenHash,
    claimedAt: Date,
  ): MagicLinkRequest | undefined | Promise<MagicLinkRequest | undefined>;
  listMagicLinkRequestsForEmail(email: string): MagicLinkRequest[] | Promise<MagicLinkRequest[]>;
  updateMagicLinkRequestStatus(
    id: MagicLinkRequestId,
    status: MagicLinkRequestStatus,
    changedAt: Date,
  ): MagicLinkRequest | undefined | Promise<MagicLinkRequest | undefined>;
  saveAccountLinkingRecord(
    record: AccountLinkingRecord,
  ): AccountLinkingRecord | Promise<AccountLinkingRecord>;
  listAccountLinkingRecordsForProvider(
    provider: AuthProvider,
    providerAccountId: AuthProviderAccountId,
  ): AccountLinkingRecord[] | Promise<AccountLinkingRecord[]>;
}

export class InMemoryAuthRepository implements AuthRepository {
  private readonly users = new Map<AuthUserId, AuthUser>();
  private readonly accounts = new Map<AuthAccountId, AuthAccount>();
  private readonly sessions = new Map<AuthSessionId, AuthSession>();
  private readonly magicLinkRequests = new Map<
    MagicLinkRequestId,
    MagicLinkRequest
  >();
  private readonly accountLinkingRecords = new Map<string, AccountLinkingRecord>();

  constructor(seed: InMemoryAuthRepositorySeed = {}) {
    seed.users?.forEach((user) => {
      this.users.set(user.id, cloneUser(user));
    });
    seed.accounts?.forEach((account) => {
      this.accounts.set(account.id, cloneAccount(account));
    });
    seed.sessions?.forEach((session) => {
      this.sessions.set(session.id, cloneSession(session));
    });
    seed.magicLinkRequests?.forEach((request) => {
      this.magicLinkRequests.set(request.id, cloneMagicLinkRequest(request));
    });
    seed.accountLinkingRecords?.forEach((record) => {
      this.accountLinkingRecords.set(record.id, cloneAccountLinkingRecord(record));
    });
  }

  saveUser(user: AuthUser): AuthUser {
    const stored = cloneUser(user);
    this.users.set(stored.id, stored);
    return cloneUser(stored);
  }

  findUserById(id: AuthUserId): AuthUser | undefined {
    const user = this.users.get(id);

    return user ? cloneUser(user) : undefined;
  }

  findUserByEmail(email: string): AuthUser | undefined {
    const normalizedEmail = normalizeRepositoryEmail(email);
    const user = Array.from(this.users.values()).find(
      (candidate) => normalizeRepositoryEmail(candidate.email) === normalizedEmail,
    );

    return user ? cloneUser(user) : undefined;
  }

  listUsers(): AuthUser[] {
    return Array.from(this.users.values())
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
      .map(cloneUser);
  }

  saveAccount(account: AuthAccount): AuthAccount {
    const stored = cloneAccount(account);
    this.accounts.set(stored.id, stored);
    return cloneAccount(stored);
  }

  saveAccountForActiveUser(account: AuthAccount): AuthAccount | undefined {
    const user = this.users.get(account.userId);

    if (!user || user.status !== "active" || user.disabledAt) {
      return undefined;
    }

    const existingProviderAccount = Array.from(this.accounts.values()).find(
      (candidate) =>
        candidate.provider === account.provider &&
        candidate.providerAccountId === account.providerAccountId &&
        candidate.id !== account.id,
    );

    if (existingProviderAccount) {
      return undefined;
    }

    return this.saveAccount(account);
  }

  findAccountById(id: AuthAccountId): AuthAccount | undefined {
    const account = this.accounts.get(id);

    return account ? cloneAccount(account) : undefined;
  }

  findAccountByProvider(
    provider: AuthProvider,
    providerAccountId: AuthProviderAccountId,
  ): AuthAccount | undefined {
    const account = Array.from(this.accounts.values()).find(
      (candidate) =>
        candidate.provider === provider &&
        candidate.providerAccountId === providerAccountId,
    );

    return account ? cloneAccount(account) : undefined;
  }

  listAccountsForUser(userId: AuthUserId): AuthAccount[] {
    return Array.from(this.accounts.values())
      .filter((account) => account.userId === userId)
      .sort((a, b) => a.linkedAt.getTime() - b.linkedAt.getTime())
      .map(cloneAccount);
  }

  saveSession(session: AuthSession): AuthSession {
    const stored = cloneSession(session);
    this.sessions.set(stored.id, stored);
    return cloneSession(stored);
  }

  saveSessionForActiveUser(session: AuthSession): AuthSession | undefined {
    const user = this.users.get(session.userId);

    if (!user || user.status !== "active" || user.disabledAt) {
      return undefined;
    }

    return this.saveSession(session);
  }

  findSessionById(id: AuthSessionId): AuthSession | undefined {
    const session = this.sessions.get(id);

    return session ? cloneSession(session) : undefined;
  }

  listSessionsForUser(userId: AuthUserId): AuthSession[] {
    return Array.from(this.sessions.values())
      .filter((session) => session.userId === userId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .map(cloneSession);
  }

  revokeSession(
    id: AuthSessionId,
    revokedAt: Date,
  ): AuthSession | undefined {
    const session = this.sessions.get(id);

    if (!session) {
      return undefined;
    }

    const updated: AuthSession = {
      ...session,
      status: "revoked",
      revokedAt,
    };

    this.sessions.set(id, cloneSession(updated));
    return cloneSession(updated);
  }

  saveMagicLinkRequest(request: MagicLinkRequest): MagicLinkRequest {
    const stored = cloneMagicLinkRequest(request);
    this.magicLinkRequests.set(stored.id, stored);
    return cloneMagicLinkRequest(stored);
  }

  findMagicLinkRequestById(
    id: MagicLinkRequestId,
  ): MagicLinkRequest | undefined {
    const request = this.magicLinkRequests.get(id);

    return request ? cloneMagicLinkRequest(request) : undefined;
  }

  findMagicLinkRequestByTokenHash(
    tokenHash: MagicLinkTokenHash,
  ): MagicLinkRequest | undefined {
    const request = Array.from(this.magicLinkRequests.values()).find(
      (candidate) => candidate.tokenHash === tokenHash,
    );

    return request ? cloneMagicLinkRequest(request) : undefined;
  }

  claimMagicLinkRequest(
    tokenHash: MagicLinkTokenHash,
    claimedAt: Date,
  ): MagicLinkRequest | undefined {
    const request = Array.from(this.magicLinkRequests.values()).find(
      (candidate) => candidate.tokenHash === tokenHash,
    );

    if (!request || request.status !== "requested" || request.expiresAt <= claimedAt) {
      return undefined;
    }

    const claimed: MagicLinkRequest = {
      ...request,
      status: "consumed",
      consumedAt: claimedAt,
    };

    this.magicLinkRequests.set(claimed.id, cloneMagicLinkRequest(claimed));

    return cloneMagicLinkRequest(claimed);
  }

  listMagicLinkRequestsForEmail(email: string): MagicLinkRequest[] {
    const normalizedEmail = normalizeRepositoryEmail(email);

    return Array.from(this.magicLinkRequests.values())
      .filter(
        (request) =>
          normalizeRepositoryEmail(request.email) === normalizedEmail,
      )
      .sort((a, b) => b.requestedAt.getTime() - a.requestedAt.getTime())
      .map(cloneMagicLinkRequest);
  }

  updateMagicLinkRequestStatus(
    id: MagicLinkRequestId,
    status: MagicLinkRequestStatus,
    changedAt: Date,
  ): MagicLinkRequest | undefined {
    const request = this.magicLinkRequests.get(id);

    if (!request) {
      return undefined;
    }

    const updated: MagicLinkRequest = {
      ...request,
      status,
      consumedAt: status === "consumed" ? changedAt : request.consumedAt,
      revokedAt: status === "revoked" ? changedAt : request.revokedAt,
    };

    this.magicLinkRequests.set(id, cloneMagicLinkRequest(updated));
    return cloneMagicLinkRequest(updated);
  }

  saveAccountLinkingRecord(record: AccountLinkingRecord): AccountLinkingRecord {
    const stored = cloneAccountLinkingRecord(record);
    this.accountLinkingRecords.set(stored.id, stored);
    return cloneAccountLinkingRecord(stored);
  }

  listAccountLinkingRecordsForProvider(
    provider: AuthProvider,
    providerAccountId: AuthProviderAccountId,
  ): AccountLinkingRecord[] {
    return Array.from(this.accountLinkingRecords.values())
      .filter(
        (record) =>
          record.provider === provider &&
          record.providerAccountId === providerAccountId,
      )
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .map(cloneAccountLinkingRecord);
  }

  clear() {
    this.users.clear();
    this.accounts.clear();
    this.sessions.clear();
    this.magicLinkRequests.clear();
    this.accountLinkingRecords.clear();
  }
}

export interface InMemoryAuthRepositorySeed {
  users?: readonly AuthUser[];
  accounts?: readonly AuthAccount[];
  sessions?: readonly AuthSession[];
  magicLinkRequests?: readonly MagicLinkRequest[];
  accountLinkingRecords?: readonly AccountLinkingRecord[];
}

function cloneUser(user: AuthUser): AuthUser {
  return {
    ...user,
    roles: [...user.roles],
    createdAt: new Date(user.createdAt),
    updatedAt: new Date(user.updatedAt),
    emailVerifiedAt: user.emailVerifiedAt
      ? new Date(user.emailVerifiedAt)
      : undefined,
    disabledAt: user.disabledAt ? new Date(user.disabledAt) : undefined,
    metadata: user.metadata ? { ...user.metadata } : undefined,
  };
}

function cloneAccount(account: AuthAccount): AuthAccount {
  return {
    ...account,
    linkedAt: new Date(account.linkedAt),
    createdAt: new Date(account.createdAt),
    updatedAt: new Date(account.updatedAt),
    emailVerifiedAt: account.emailVerifiedAt
      ? new Date(account.emailVerifiedAt)
      : undefined,
    lastAuthenticatedAt: account.lastAuthenticatedAt
      ? new Date(account.lastAuthenticatedAt)
      : undefined,
    unlinkedAt: account.unlinkedAt ? new Date(account.unlinkedAt) : undefined,
    metadata: account.metadata ? { ...account.metadata } : undefined,
  };
}

function cloneSession(session: AuthSession): AuthSession {
  return {
    ...session,
    createdAt: new Date(session.createdAt),
    expiresAt: new Date(session.expiresAt),
    lastSeenAt: session.lastSeenAt ? new Date(session.lastSeenAt) : undefined,
    revokedAt: session.revokedAt ? new Date(session.revokedAt) : undefined,
    requestContext: session.requestContext
      ? { ...session.requestContext }
      : undefined,
  };
}

function cloneMagicLinkRequest(request: MagicLinkRequest): MagicLinkRequest {
  return {
    ...request,
    requestedAt: new Date(request.requestedAt),
    expiresAt: new Date(request.expiresAt),
    consumedAt: request.consumedAt ? new Date(request.consumedAt) : undefined,
    revokedAt: request.revokedAt ? new Date(request.revokedAt) : undefined,
    requestContext: request.requestContext
      ? { ...request.requestContext }
      : undefined,
  };
}

function cloneAccountLinkingRecord(record: AccountLinkingRecord): AccountLinkingRecord {
  return {
    ...record,
    createdAt: new Date(record.createdAt),
    metadata: record.metadata ? { ...record.metadata } : undefined,
  };
}

function normalizeRepositoryEmail(email: string): string {
  return email.trim().toLowerCase();
}
