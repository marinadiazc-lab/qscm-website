import type {
  CreateEmailSendIntentInput,
  EmailDeliveryLog,
  EmailProvider,
  EmailSendIntent,
  EmailSendIntentReference,
  EmailSendIntentStatus,
  EmailSendResult,
  SendEmailBroadcastInput,
  SendTransactionalEmailInput,
} from "./types";

export interface EmailSendIntentRepository {
  createOrGet(input: CreateEmailSendIntentInput): Promise<EmailSendIntent>;
  reserve(intentId: string, provider: string): Promise<EmailSendIntent>;
  markResult(intentId: string, result: EmailSendResult): Promise<EmailSendIntent>;
  markFailed(intentId: string, errorMessage: string): Promise<EmailSendIntent>;
  listIntents(filter?: { subscriberId?: string; broadcastId?: string }): Promise<EmailSendIntent[]>;
  logDelivery(log: Omit<EmailDeliveryLog, "id" | "createdAt">): Promise<EmailDeliveryLog>;
  listDeliveryLogs(filter?: {
    subscriberId?: string;
    broadcastId?: string;
    providerMessageId?: string;
  }): Promise<EmailDeliveryLog[]>;
}

export class InMemoryEmailSendIntentRepository implements EmailSendIntentRepository {
  private readonly intents = new Map<string, EmailSendIntent>();
  private readonly dedupeIndex = new Map<string, string>();
  private readonly logs: EmailDeliveryLog[] = [];
  private nextId = 1;

  constructor(private readonly now: () => Date = () => new Date()) {}

  async createOrGet(input: CreateEmailSendIntentInput): Promise<EmailSendIntent> {
    const key = `${input.publicationId}:${input.dedupeKey}`;
    const existingId = this.dedupeIndex.get(key);

    if (existingId) {
      return cloneIntent(this.intents.get(existingId)!);
    }

    const now = this.now();
    const intent: EmailSendIntent = {
      id: this.generateId("intent"),
      publicationId: input.publicationId,
      kind: input.kind,
      dedupeKey: input.dedupeKey,
      status: "pending",
      recipientEmail: input.recipientEmail,
      subscriberId: input.subscriberId,
      broadcastId: input.broadcastId,
      createdAt: now,
      updatedAt: now,
    };

    this.intents.set(intent.id, intent);
    this.dedupeIndex.set(key, intent.id);
    return cloneIntent(intent);
  }

  async reserve(intentId: string, provider: string): Promise<EmailSendIntent> {
    const intent = this.requireIntent(intentId);

    if (intent.status !== "pending") {
      return cloneIntent({ ...intent, status: "skipped_duplicate" });
    }

    const updated = {
      ...intent,
      status: "reserved" as const,
      provider,
      reservedAt: this.now(),
      updatedAt: this.now(),
    };
    this.intents.set(updated.id, updated);
    return cloneIntent(updated);
  }

  async markResult(intentId: string, result: EmailSendResult): Promise<EmailSendIntent> {
    const intent = this.requireIntent(intentId);
    const updated = {
      ...intent,
      status: result.status,
      provider: result.provider,
      providerMessageId: result.providerMessageId,
      providerBroadcastId: result.providerBroadcastId,
      sentAt: result.sentAt,
      updatedAt: this.now(),
    };
    this.intents.set(updated.id, updated);
    await this.logDelivery({
      publicationId: updated.publicationId,
      intentId: updated.id,
      broadcastId: updated.broadcastId,
      subscriberId: updated.subscriberId,
      recipientEmail: updated.recipientEmail,
      provider: result.provider,
      providerMessageId: result.providerMessageId,
      eventType: result.status,
      level: result.accepted ? "info" : "warning",
      message: result.skippedReason,
      metadata: { dedupeKey: result.dedupeKey },
    });
    return cloneIntent(updated);
  }

  async markFailed(intentId: string, errorMessage: string): Promise<EmailSendIntent> {
    const intent = this.requireIntent(intentId);
    const updated = {
      ...intent,
      status: "failed" as const,
      errorMessage,
      updatedAt: this.now(),
    };
    this.intents.set(updated.id, updated);
    await this.logDelivery({
      publicationId: updated.publicationId,
      intentId: updated.id,
      broadcastId: updated.broadcastId,
      subscriberId: updated.subscriberId,
      recipientEmail: updated.recipientEmail,
      provider: updated.provider,
      eventType: "failed",
      level: "error",
      message: errorMessage,
    });
    return cloneIntent(updated);
  }

  async listIntents(filter: { subscriberId?: string; broadcastId?: string } = {}) {
    return Array.from(this.intents.values())
      .filter((intent) => !filter.subscriberId || intent.subscriberId === filter.subscriberId)
      .filter((intent) => !filter.broadcastId || intent.broadcastId === filter.broadcastId)
      .map(cloneIntent);
  }

  async logDelivery(log: Omit<EmailDeliveryLog, "id" | "createdAt">) {
    const stored: EmailDeliveryLog = {
      id: this.generateId("log"),
      createdAt: this.now(),
      ...log,
    };
    this.logs.push(stored);
    return cloneLog(stored);
  }

  async listDeliveryLogs(
    filter: { subscriberId?: string; broadcastId?: string; providerMessageId?: string } = {},
  ) {
    return this.logs
      .filter((log) => !filter.subscriberId || log.subscriberId === filter.subscriberId)
      .filter((log) => !filter.broadcastId || log.broadcastId === filter.broadcastId)
      .filter((log) => !filter.providerMessageId || log.providerMessageId === filter.providerMessageId)
      .map(cloneLog);
  }

  private requireIntent(intentId: string) {
    const intent = this.intents.get(intentId);
    if (!intent) {
      throw new Error(`Email send intent ${intentId} was not found.`);
    }
    return intent;
  }

  private generateId(prefix: string) {
    const id = `${prefix}_${this.nextId}`;
    this.nextId += 1;
    return id;
  }
}

export class EmailSendService {
  constructor(
    private readonly repository: EmailSendIntentRepository,
    private readonly provider: EmailProvider,
  ) {}

  async sendTransactional(
    input: Omit<SendTransactionalEmailInput, "intent"> & {
      dedupeKey: string;
      subscriberId?: string;
    },
  ) {
    const to = Array.isArray(input.to) ? input.to[0] : input.to;
    const intent = await this.repository.createOrGet({
      publicationId: input.publicationId,
      kind: "transactional",
      dedupeKey: input.dedupeKey,
      recipientEmail: to?.email,
      subscriberId: input.subscriberId,
    });
    const reservation = await this.repository.reserve(intent.id, this.provider.key);

    if (isDuplicateReservation(reservation.status)) {
      const result = duplicateResult(this.provider.key, toIntentReference(intent));
      await this.logDuplicate(intent, result);
      return result;
    }

    try {
      const result = await this.provider.sendTransactional({
        ...input,
        intent: toIntentReference(intent),
      });
      await this.repository.markResult(intent.id, result);
      return result;
    } catch (error) {
      await this.repository.markFailed(intent.id, safeError(error));
      throw error;
    }
  }

  async sendBroadcast(
    input: Omit<SendEmailBroadcastInput, "intent"> & {
      publicationId: string;
      dedupeKey: string;
    },
  ) {
    const intent = await this.repository.createOrGet({
      publicationId: input.publicationId,
      kind: "broadcast",
      dedupeKey: input.dedupeKey,
      broadcastId: input.broadcastId,
    });
    const reservation = await this.repository.reserve(intent.id, this.provider.key);

    if (isDuplicateReservation(reservation.status)) {
      const result = duplicateResult(this.provider.key, toIntentReference(intent), input.broadcastId);
      await this.logDuplicate(intent, result);
      return result;
    }

    try {
      const result = await this.provider.sendBroadcast({
        ...input,
        intent: toIntentReference(intent),
      });
      await this.repository.markResult(intent.id, result);
      return result;
    } catch (error) {
      await this.repository.markFailed(intent.id, safeError(error));
      throw error;
    }
  }

  private async logDuplicate(intent: EmailSendIntent, result: EmailSendResult) {
    await this.repository.logDelivery({
      publicationId: intent.publicationId,
      intentId: intent.id,
      broadcastId: intent.broadcastId ?? result.broadcastId,
      subscriberId: intent.subscriberId,
      recipientEmail: intent.recipientEmail,
      provider: result.provider,
      providerMessageId: intent.providerMessageId,
      eventType: "skipped_duplicate",
      level: "warning",
      message: result.skippedReason,
      metadata: { dedupeKey: result.dedupeKey },
    });
  }
}

function toIntentReference(intent: EmailSendIntent): EmailSendIntentReference {
  return { id: intent.id, dedupeKey: intent.dedupeKey };
}

function isDuplicateReservation(status: EmailSendIntentStatus) {
  return status === "skipped_duplicate";
}

function duplicateResult(provider: string, intent: EmailSendIntentReference, broadcastId?: string) {
  return {
    provider,
    intentId: intent.id,
    dedupeKey: intent.dedupeKey,
    status: "skipped_duplicate" as const,
    accepted: false,
    broadcastId,
    skippedReason: "A send intent with this dedupe key was already reserved or sent.",
  };
}

function safeError(error: unknown) {
  return error instanceof Error ? error.message.slice(0, 500) : "Unknown email send failure.";
}

function cloneIntent(intent: EmailSendIntent): EmailSendIntent {
  return {
    ...intent,
    createdAt: new Date(intent.createdAt),
    updatedAt: new Date(intent.updatedAt),
    reservedAt: intent.reservedAt ? new Date(intent.reservedAt) : undefined,
    sentAt: intent.sentAt ? new Date(intent.sentAt) : undefined,
  };
}

function cloneLog(log: EmailDeliveryLog): EmailDeliveryLog {
  return {
    ...log,
    metadata: log.metadata ? { ...log.metadata } : undefined,
    createdAt: new Date(log.createdAt),
  };
}
