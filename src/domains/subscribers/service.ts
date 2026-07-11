import type {
  LinkSubscriberToUserInput,
  SubscriberImportError,
  SubscriberImportResult,
  SubscriberImportRow,
  SubscriberPreferences,
  SubscriberProviderSync,
  SubscriberRecord,
  SubscriberSearchInput,
  SubscriberSearchResult,
  SubscriberSignupInput,
  SubscriberSignupResult,
  SubscriberStatus,
  SubscriberStatusUpdateInput,
  SubscriberSyncRequest,
  SubscriberSyncStatus,
  SubscriberPreferenceUpdateInput,
} from "./types";

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const suppressedStatuses = new Set<SubscriberStatus>([
  "unsubscribed",
  "bounced",
  "complained",
  "suppressed",
]);

export interface SubscriberRepository {
  saveSubscriber(subscriber: SubscriberRecord): Promise<SubscriberRecord> | SubscriberRecord;
  findSubscriberById(id: string): Promise<SubscriberRecord | undefined> | SubscriberRecord | undefined;
  findSubscriberByEmail(
    publicationId: string,
    email: string,
  ): Promise<SubscriberRecord | undefined> | SubscriberRecord | undefined;
  listSubscribers(input: SubscriberSearchInput): Promise<SubscriberSearchResult[]> | SubscriberSearchResult[];
  savePreferences(preferences: SubscriberPreferences): Promise<SubscriberPreferences> | SubscriberPreferences;
  findPreferences(subscriberId: string): Promise<SubscriberPreferences | undefined> | SubscriberPreferences | undefined;
  saveProviderSync(sync: SubscriberProviderSync): Promise<SubscriberProviderSync> | SubscriberProviderSync;
  findProviderSync(
    subscriberId: string,
    provider: string,
  ): Promise<SubscriberProviderSync | undefined> | SubscriberProviderSync | undefined;
  listProviderSyncs(subscriberId: string): Promise<SubscriberProviderSync[]> | SubscriberProviderSync[];
  listPendingProviderSyncs?(
    provider: string,
    limit?: number,
  ): Promise<SubscriberProviderSync[]> | SubscriberProviderSync[];
  queueSync(request: SubscriberSyncRequest, now: Date): Promise<boolean> | boolean;
}

export interface SubscriberServiceOptions {
  idFactory?: () => string;
  clock?: () => Date;
  syncProvider?: string;
}

export class SubscriberService {
  private readonly idFactory: () => string;
  private readonly clock: () => Date;
  private readonly syncProvider: string;

  constructor(
    private readonly repository: SubscriberRepository,
    options: SubscriberServiceOptions = {},
  ) {
    this.idFactory = options.idFactory ?? randomId;
    this.clock = options.clock ?? (() => new Date());
    this.syncProvider = options.syncProvider ?? "resend";
  }

  async signup(input: SubscriberSignupInput): Promise<SubscriberSignupResult> {
    const now = input.now ?? this.clock();
    const email = normalizeSubscriberEmail(input.email);
    validateEmail(email);

    const existing = await this.repository.findSubscriberByEmail(input.publicationId, email);
    const name = cleanOptionalText(input.name);

    if (existing) {
      const restored = existing.status === "unsubscribed" || existing.status === "active";
      const subscriber = await this.repository.saveSubscriber({
        ...existing,
        userId: existing.userId ?? input.userId,
        status: restored ? "active" : existing.status,
        source: existing.source ?? cleanOptionalText(input.source),
        subscribedAt: existing.subscribedAt ?? now,
        unsubscribedAt: restored ? undefined : existing.unsubscribedAt,
        metadata: mergeSubscriberMetadata(existing.metadata, { name }),
        updatedAt: now,
      });
      const preferences = await this.ensurePreferences(subscriber.id, now);
      const syncQueued = await this.queueSync(subscriber.id, "signup", now, {
        idempotent: true,
      });

      return { subscriber, preferences, created: false, syncQueued };
    }

    const subscriber: SubscriberRecord = {
      id: this.idFactory(),
      publicationId: input.publicationId,
      userId: input.userId,
      email,
      status: "active",
      source: cleanOptionalText(input.source) ?? "free_signup",
      subscribedAt: now,
      metadata: mergeSubscriberMetadata({}, { name }),
      createdAt: now,
      updatedAt: now,
    };
    const saved = await this.repository.saveSubscriber(subscriber);
    const preferences = await this.ensurePreferences(saved.id, now);
    const syncQueued = await this.queueSync(saved.id, "signup", now);

    return {
      subscriber: saved,
      preferences,
      created: saved.id === subscriber.id,
      syncQueued,
    };
  }

  async linkToVerifiedUser(
    input: LinkSubscriberToUserInput,
  ): Promise<SubscriberRecord | undefined> {
    if (!input.emailVerified) {
      return undefined;
    }

    const subscriber = await this.repository.findSubscriberByEmail(
      input.publicationId,
      normalizeSubscriberEmail(input.email),
    );

    if (!subscriber) {
      return undefined;
    }

    if (subscriber.userId && subscriber.userId !== input.userId) {
      return subscriber;
    }

    const now = input.now ?? this.clock();
    const updated = await this.repository.saveSubscriber({
      ...subscriber,
      userId: input.userId,
      updatedAt: now,
    });
    await this.queueSync(updated.id, "account_link", now);

    return updated;
  }

  async updatePreferences(
    input: SubscriberPreferenceUpdateInput,
  ): Promise<SubscriberPreferences> {
    const now = input.now ?? this.clock();
    const subscriber = requireSubscriber(
      await this.repository.findSubscriberById(input.subscriberId),
      input.subscriberId,
    );
    const current = await this.ensurePreferences(subscriber.id, now);
    const preferences = await this.repository.savePreferences({
      ...current,
      marketingEmailOptIn:
        input.unsubscribe === true ? false : input.marketingEmailOptIn ?? current.marketingEmailOptIn,
      productEmailOptIn:
        input.unsubscribe === true ? false : input.productEmailOptIn ?? current.productEmailOptIn,
      commentNotificationOptIn:
        input.commentNotificationOptIn ?? current.commentNotificationOptIn,
      updatedAt: now,
    });

    if (input.unsubscribe === true) {
      await this.updateStatus({
        subscriberId: subscriber.id,
        status: "unsubscribed",
        reason: "preference_center",
        occurredAt: now,
      });
    } else {
      await this.queueSync(subscriber.id, "preference_update", now);
    }

    return preferences;
  }

  async updateStatus(input: SubscriberStatusUpdateInput): Promise<SubscriberRecord> {
    const now = input.occurredAt ?? this.clock();
    const subscriber = requireSubscriber(
      await this.repository.findSubscriberById(input.subscriberId),
      input.subscriberId,
    );
    const statusDates = statusDatePatch(input.status, now);
    const updated = await this.repository.saveSubscriber({
      ...subscriber,
      status: input.status,
      ...statusDates,
      metadata: {
        ...subscriber.metadata,
        statusReason: cleanOptionalText(input.reason),
        statusProvider: cleanOptionalText(input.provider),
      },
      updatedAt: now,
    });

    if (suppressedStatuses.has(input.status)) {
      const current = await this.ensurePreferences(updated.id, now);
      await this.repository.savePreferences({
        ...current,
        marketingEmailOptIn: false,
        productEmailOptIn: false,
        updatedAt: now,
      });
    }

    await this.queueSync(updated.id, "status_update", now, {
      status: input.status,
      reason: input.reason,
    });

    return updated;
  }

  async search(input: SubscriberSearchInput): Promise<SubscriberSearchResult[]> {
    return this.repository.listSubscribers({
      ...input,
      query: cleanOptionalText(input.query),
      limit: input.limit ?? 50,
    });
  }

  async importRows(
    publicationId: string,
    rows: SubscriberImportRow[],
  ): Promise<SubscriberImportResult> {
    const errors: SubscriberImportError[] = [];
    let imported = 0;
    let updated = 0;
    let skipped = 0;

    for (const [index, row] of rows.entries()) {
      const rowNumber = index + 2;

      try {
        const result = await this.signup({
          publicationId,
          email: row.email,
          source: row.source ?? "admin_import",
          name: row.name,
        });

        if (row.status && row.status !== result.subscriber.status) {
          await this.updateStatus({
            subscriberId: result.subscriber.id,
            status: row.status,
            reason: "admin_import",
          });
        }

        await this.updatePreferences({
          subscriberId: result.subscriber.id,
          marketingEmailOptIn: row.marketingEmailOptIn,
          productEmailOptIn: row.productEmailOptIn,
          commentNotificationOptIn: row.commentNotificationOptIn,
        });

        if (result.created) {
          imported += 1;
        } else {
          updated += 1;
        }
      } catch (error) {
        skipped += 1;
        errors.push({
          row: rowNumber,
          code: "invalid_row",
          message: error instanceof Error ? error.message : "Invalid subscriber row.",
        });
      }
    }

    return { imported, updated, skipped, errors };
  }

  canReceiveMarketingEmail(subscriber: SubscriberRecord, preferences?: SubscriberPreferences) {
    if (suppressedStatuses.has(subscriber.status)) {
      return false;
    }

    return preferences?.marketingEmailOptIn ?? true;
  }

  private async ensurePreferences(
    subscriberId: string,
    now: Date,
  ): Promise<SubscriberPreferences> {
    const existing = await this.repository.findPreferences(subscriberId);

    if (existing) {
      return existing;
    }

    return this.repository.savePreferences({
      subscriberId,
      marketingEmailOptIn: true,
      productEmailOptIn: true,
      commentNotificationOptIn: true,
      metadata: {},
      updatedAt: now,
    });
  }

  private async queueSync(
    subscriberId: string,
    reason: SubscriberSyncRequest["reason"],
    now: Date,
    metadata: Record<string, unknown> = {},
  ) {
    return this.repository.queueSync(
      {
        subscriberId,
        provider: this.syncProvider,
        reason,
        metadata,
      },
      now,
    );
  }
}

export function normalizeSubscriberEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function parseSubscriberCsv(csv: string): SubscriberImportRow[] {
  const lines = csv
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length === 0) {
    return [];
  }

  const headers = splitCsvLine(lines[0]).map((header) => header.trim());

  return lines.slice(1).map((line) => {
    const cells = splitCsvLine(line);
    const row = Object.fromEntries(headers.map((header, index) => [header, cells[index] ?? ""]));

    return {
      email: row.email ?? "",
      status: normalizeStatus(row.status),
      source: cleanOptionalText(row.source),
      name: cleanOptionalText(row.name),
      marketingEmailOptIn: parseBoolean(row.marketingEmailOptIn),
      productEmailOptIn: parseBoolean(row.productEmailOptIn),
      commentNotificationOptIn: parseBoolean(row.commentNotificationOptIn),
    };
  });
}

export function buildSubscriberCsv(rows: SubscriberSearchResult[]): string {
  const headers = [
    "id",
    "email",
    "name",
    "status",
    "source",
    "userId",
    "marketingEmailOptIn",
    "productEmailOptIn",
    "commentNotificationOptIn",
    "syncStatus",
    "syncProvider",
    "createdAt",
    "updatedAt",
  ];
  const body = rows.map(({ preferences, subscriber, syncs }) => {
    const sync = syncs[0];

    return [
      subscriber.id,
      subscriber.email,
      metadataString(subscriber.metadata.name),
      subscriber.status,
      subscriber.source ?? "",
      subscriber.userId ?? "",
      String(preferences?.marketingEmailOptIn ?? true),
      String(preferences?.productEmailOptIn ?? true),
      String(preferences?.commentNotificationOptIn ?? true),
      sync?.syncStatus ?? "",
      sync?.provider ?? "",
      subscriber.createdAt.toISOString(),
      subscriber.updatedAt.toISOString(),
    ].map(escapeCsvCell);
  });

  return [headers, ...body].map((row) => row.join(",")).join("\n");
}

export function isMarketingSuppressed(status: SubscriberStatus): boolean {
  return suppressedStatuses.has(status);
}

export function isSyncRetryable(status: SubscriberSyncStatus): boolean {
  return status === "pending" || status === "failed";
}

function validateEmail(email: string) {
  if (!emailPattern.test(email)) {
    throw new Error("Enter a valid email address.");
  }
}

function cleanOptionalText(value: string | undefined) {
  const cleaned = value?.trim();
  return cleaned ? cleaned : undefined;
}

function mergeSubscriberMetadata(
  metadata: Record<string, unknown>,
  updates: Record<string, unknown>,
) {
  return Object.fromEntries(
    Object.entries({ ...metadata, ...updates }).filter(([, value]) => value !== undefined),
  );
}

function statusDatePatch(status: SubscriberStatus, now: Date) {
  if (status === "unsubscribed") return { unsubscribedAt: now };
  if (status === "bounced") return { bouncedAt: now };
  if (status === "complained") return { complainedAt: now };
  if (status === "suppressed") return { suppressedAt: now };
  return {};
}

function requireSubscriber(
  subscriber: SubscriberRecord | undefined,
  subscriberId: string,
): SubscriberRecord {
  if (!subscriber) {
    throw new Error(`Subscriber ${subscriberId} was not found.`);
  }

  return subscriber;
}

function splitCsvLine(line: string): string[] {
  const cells: string[] = [];
  let current = "";
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];

    if (char === '"' && quoted && next === '"') {
      current += '"';
      index += 1;
      continue;
    }

    if (char === '"') {
      quoted = !quoted;
      continue;
    }

    if (char === "," && !quoted) {
      cells.push(current);
      current = "";
      continue;
    }

    current += char;
  }

  cells.push(current);
  return cells;
}

function parseBoolean(value: string | undefined): boolean | undefined {
  const normalized = value?.trim().toLowerCase();

  if (!normalized) return undefined;
  if (["true", "1", "yes", "y"].includes(normalized)) return true;
  if (["false", "0", "no", "n"].includes(normalized)) return false;
  return undefined;
}

function normalizeStatus(value: string | undefined): SubscriberStatus | undefined {
  const normalized = value?.trim().toLowerCase();
  const allowed: SubscriberStatus[] = [
    "active",
    "unsubscribed",
    "bounced",
    "complained",
    "suppressed",
  ];

  return allowed.find((status) => status === normalized);
}

function metadataString(value: unknown) {
  return typeof value === "string" ? value : "";
}

function escapeCsvCell(value: string) {
  if (!/[",\n]/.test(value)) {
    return value;
  }

  return `"${value.replaceAll('"', '""')}"`;
}

function randomId() {
  return crypto.randomUUID();
}
