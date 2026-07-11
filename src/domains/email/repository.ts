import { and, desc, eq, inArray } from "drizzle-orm";
import type { DbClient } from "@/src/db";
import { schema } from "@/src/db";
import type {
  CreateEmailBroadcastInput,
  CreateEmailSendIntentInput,
  EmailBroadcast,
  EmailBroadcastId,
  EmailBroadcastStatus,
  EmailBroadcastTarget,
  EmailDeliveryLog,
  EmailMetadata,
  EmailProviderKey,
  EmailSendIntent,
  EmailSendResult,
} from "./types";
import type { EmailSendIntentRepository } from "./send-intents";
import type { EmailBroadcastRepository } from "./broadcasts";

export class DrizzleEmailBroadcastRepository implements EmailBroadcastRepository {
  constructor(private readonly db: DbClient) {}

  async createOrGet(
    input: CreateEmailBroadcastInput & { provider: EmailProviderKey },
  ): Promise<EmailBroadcast> {
    const inserted = await this.db
      .insert(schema.emailBroadcasts)
      .values({
        publicationId: input.publicationId,
        provider: input.provider,
        key: input.key,
        status: input.scheduledAt ? "scheduled" : "draft",
        subject: input.content.subject,
        previewText: input.content.previewText,
        html: input.content.html,
        text: input.content.text,
        target: input.target as Record<string, unknown>,
        metadata: input.metadata ?? {},
        scheduledAt: input.scheduledAt,
      })
      .onConflictDoNothing()
      .returning();

    if (inserted[0]) {
      return toBroadcast(inserted[0]);
    }

    if (!input.key) {
      throw new Error("Email broadcast insert conflicted but no unique key was provided.");
    }

    const existing = await this.db.query.emailBroadcasts.findFirst({
      where: and(
        eq(schema.emailBroadcasts.publicationId, input.publicationId),
        eq(schema.emailBroadcasts.key, input.key),
      ),
    });

    if (!existing) {
      throw new Error("Email broadcast insert conflicted but no existing broadcast was found.");
    }

    return toBroadcast(existing);
  }

  async findById(id: EmailBroadcastId) {
    const row = await this.db.query.emailBroadcasts.findFirst({
      where: eq(schema.emailBroadcasts.id, id),
    });

    return row ? toBroadcast(row) : undefined;
  }

  async markProviderCreated(id: EmailBroadcastId, broadcast: EmailBroadcast) {
    const existing = await this.requireBroadcast(id);
    const updated = await this.db
      .update(schema.emailBroadcasts)
      .set({
        status: broadcast.status,
        providerBroadcastId: broadcast.providerBroadcastId ?? existing.providerBroadcastId,
        scheduledAt: broadcast.scheduledAt ?? existing.scheduledAt,
        sentAt: broadcast.sentAt ?? existing.sentAt,
        metadata: {
          ...(existing.metadata ?? {}),
          ...(broadcast.metadata ?? {}),
        },
        updatedAt: new Date(),
      })
      .where(eq(schema.emailBroadcasts.id, id))
      .returning();

    return toBroadcast(updated[0] ?? (await this.requireBroadcast(id)));
  }

  async markSendResult(id: EmailBroadcastId, result: EmailSendResult) {
    const existing = await this.requireBroadcast(id);
    const updated = await this.db
      .update(schema.emailBroadcasts)
      .set({
        status: result.status === "sent" ? "sent" : existing.status,
        providerBroadcastId: result.providerBroadcastId ?? existing.providerBroadcastId,
        sentAt: result.sentAt ?? existing.sentAt,
        updatedAt: new Date(),
      })
      .where(eq(schema.emailBroadcasts.id, id))
      .returning();

    return toBroadcast(updated[0] ?? (await this.requireBroadcast(id)));
  }

  async listBroadcasts(filter: { publicationId?: string; status?: EmailBroadcastStatus } = {}) {
    const rows = await this.db.query.emailBroadcasts.findMany({
      where: and(
        filter.publicationId
          ? eq(schema.emailBroadcasts.publicationId, filter.publicationId)
          : undefined,
        filter.status ? eq(schema.emailBroadcasts.status, filter.status) : undefined,
      ),
      orderBy: desc(schema.emailBroadcasts.createdAt),
    });

    return rows.map(toBroadcast);
  }

  private async requireBroadcast(id: EmailBroadcastId) {
    const existing = await this.findById(id);

    if (!existing) {
      throw new Error(`Email broadcast ${id} was not found.`);
    }

    return existing;
  }
}

export class DrizzleEmailSendIntentRepository implements EmailSendIntentRepository {
  constructor(private readonly db: DbClient) {}

  async createOrGet(input: CreateEmailSendIntentInput): Promise<EmailSendIntent> {
    const inserted = await this.db
      .insert(schema.emailSendIntents)
      .values({
        publicationId: input.publicationId,
        kind: input.kind,
        dedupeKey: input.dedupeKey,
        recipientEmail: input.recipientEmail,
        subscriberId: input.subscriberId,
        broadcastId: input.broadcastId,
        metadata: input.metadata ?? {},
      })
      .onConflictDoNothing()
      .returning();

    if (inserted[0]) {
      return toIntent(inserted[0]);
    }

    const existing = await this.db.query.emailSendIntents.findFirst({
      where: and(
        eq(schema.emailSendIntents.publicationId, input.publicationId),
        eq(schema.emailSendIntents.dedupeKey, input.dedupeKey),
      ),
    });

    if (!existing) {
      throw new Error("Email send intent insert conflicted but no existing intent was found.");
    }

    return toIntent(existing);
  }

  async reserve(intentId: string, provider: string): Promise<EmailSendIntent> {
    const updated = await this.db
      .update(schema.emailSendIntents)
      .set({
        status: "reserved",
        provider,
        reservedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(schema.emailSendIntents.id, intentId),
          inArray(schema.emailSendIntents.status, ["pending"]),
        ),
      )
      .returning();

    if (updated[0]) {
      return toIntent(updated[0]);
    }

    const existing = await this.requireIntent(intentId);
    return {
      ...existing,
      status: "skipped_duplicate",
    };
  }

  async markResult(intentId: string, result: EmailSendResult): Promise<EmailSendIntent> {
    const updated = await this.db
      .update(schema.emailSendIntents)
      .set({
        status: result.status,
        provider: result.provider,
        providerMessageId: result.providerMessageId,
        providerBroadcastId: result.providerBroadcastId,
        sentAt: result.sentAt,
        updatedAt: new Date(),
      })
      .where(eq(schema.emailSendIntents.id, intentId))
      .returning();
    const intent = toIntent(updated[0] ?? (await this.requireIntent(intentId)));

    await this.logDelivery({
      publicationId: intent.publicationId,
      intentId: intent.id,
      broadcastId: intent.broadcastId,
      subscriberId: intent.subscriberId,
      recipientEmail: intent.recipientEmail,
      provider: result.provider,
      providerMessageId: result.providerMessageId,
      eventType: result.status,
      level: result.accepted ? "info" : "warning",
      message: result.skippedReason,
      metadata: { dedupeKey: result.dedupeKey },
    });

    return intent;
  }

  async markFailed(intentId: string, errorMessage: string): Promise<EmailSendIntent> {
    const updated = await this.db
      .update(schema.emailSendIntents)
      .set({
        status: "failed",
        errorMessage,
        updatedAt: new Date(),
      })
      .where(eq(schema.emailSendIntents.id, intentId))
      .returning();
    const intent = toIntent(updated[0] ?? (await this.requireIntent(intentId)));

    await this.logDelivery({
      publicationId: intent.publicationId,
      intentId: intent.id,
      broadcastId: intent.broadcastId,
      subscriberId: intent.subscriberId,
      recipientEmail: intent.recipientEmail,
      provider: intent.provider,
      eventType: "failed",
      level: "error",
      message: errorMessage,
    });

    return intent;
  }

  async listIntents(filter: { subscriberId?: string; broadcastId?: string } = {}) {
    const rows = await this.db.query.emailSendIntents.findMany({
      where: and(
        filter.subscriberId
          ? eq(schema.emailSendIntents.subscriberId, filter.subscriberId)
          : undefined,
        filter.broadcastId
          ? eq(schema.emailSendIntents.broadcastId, filter.broadcastId)
          : undefined,
      ),
      orderBy: desc(schema.emailSendIntents.createdAt),
    });

    return rows.map(toIntent);
  }

  async logDelivery(log: Omit<EmailDeliveryLog, "id" | "createdAt">) {
    const inserted = await this.db
      .insert(schema.emailDeliveryLogs)
      .values({
        publicationId: log.publicationId,
        intentId: log.intentId,
        broadcastId: log.broadcastId,
        subscriberId: log.subscriberId,
        recipientEmail: log.recipientEmail,
        provider: log.provider,
        providerMessageId: log.providerMessageId,
        eventType: log.eventType,
        level: log.level,
        message: log.message,
        metadata: log.metadata ?? {},
      })
      .returning();

    return toLog(inserted[0]);
  }

  async listDeliveryLogs(
    filter: { subscriberId?: string; broadcastId?: string; providerMessageId?: string } = {},
  ) {
    const rows = await this.db.query.emailDeliveryLogs.findMany({
      where: and(
        filter.subscriberId
          ? eq(schema.emailDeliveryLogs.subscriberId, filter.subscriberId)
          : undefined,
        filter.broadcastId
          ? eq(schema.emailDeliveryLogs.broadcastId, filter.broadcastId)
          : undefined,
        filter.providerMessageId
          ? eq(schema.emailDeliveryLogs.providerMessageId, filter.providerMessageId)
          : undefined,
      ),
      orderBy: desc(schema.emailDeliveryLogs.createdAt),
    });

    return rows.map(toLog);
  }

  private async requireIntent(intentId: string) {
    const existing = await this.db.query.emailSendIntents.findFirst({
      where: eq(schema.emailSendIntents.id, intentId),
    });

    if (!existing) {
      throw new Error(`Email send intent ${intentId} was not found.`);
    }

    return toIntent(existing);
  }
}

function toBroadcast(row: typeof schema.emailBroadcasts.$inferSelect): EmailBroadcast {
  return {
    id: row.id,
    provider: row.provider,
    publicationId: row.publicationId,
    key: row.key ?? undefined,
    status: row.status,
    content: {
      subject: row.subject,
      previewText: row.previewText ?? undefined,
      html: row.html ?? undefined,
      text: row.text ?? undefined,
    },
    target: row.target as EmailBroadcastTarget,
    providerBroadcastId: row.providerBroadcastId ?? undefined,
    scheduledAt: row.scheduledAt ?? undefined,
    sentAt: row.sentAt ?? undefined,
    metadata: row.metadata as EmailMetadata,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toIntent(row: typeof schema.emailSendIntents.$inferSelect): EmailSendIntent {
  return {
    id: row.id,
    publicationId: row.publicationId,
    kind: row.kind,
    dedupeKey: row.dedupeKey,
    status: row.status,
    provider: row.provider ?? undefined,
    recipientEmail: row.recipientEmail ?? undefined,
    subscriberId: row.subscriberId ?? undefined,
    broadcastId: row.broadcastId ?? undefined,
    providerMessageId: row.providerMessageId ?? undefined,
    providerBroadcastId: row.providerBroadcastId ?? undefined,
    errorMessage: row.errorMessage ?? undefined,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    reservedAt: row.reservedAt ?? undefined,
    sentAt: row.sentAt ?? undefined,
  };
}

function toLog(row: typeof schema.emailDeliveryLogs.$inferSelect): EmailDeliveryLog {
  return {
    id: row.id,
    publicationId: row.publicationId ?? undefined,
    intentId: row.intentId ?? undefined,
    broadcastId: row.broadcastId ?? undefined,
    subscriberId: row.subscriberId ?? undefined,
    recipientEmail: row.recipientEmail ?? undefined,
    provider: row.provider ?? undefined,
    providerMessageId: row.providerMessageId ?? undefined,
    eventType: row.eventType,
    level: row.level,
    message: row.message ?? undefined,
    metadata: row.metadata as EmailMetadata,
    createdAt: row.createdAt,
  };
}
