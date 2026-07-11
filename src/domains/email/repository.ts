import { and, desc, eq, inArray, sql } from "drizzle-orm";
import type { DbClient } from "@/src/db";
import { db, schema } from "@/src/db";
import type {
  EmailProviderEventClaimResult,
  EmailProviderEventRepository,
} from "./events";
import type {
  CreateEmailSendIntentInput,
  EmailDeliveryLog,
  EmailMetadata,
  EmailProviderEvent,
  EmailSendIntent,
  EmailSendResult,
} from "./types";
import type { EmailSendIntentRepository } from "./send-intents";

export class DrizzleEmailSendIntentRepository
  implements EmailSendIntentRepository, EmailProviderEventRepository
{
  constructor(private readonly db: DbClient = db) {}

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

  async claimProviderEvent(
    event: EmailProviderEvent,
    input: {
      payloadHash?: string;
      payload: Record<string, unknown>;
    },
  ): Promise<EmailProviderEventClaimResult> {
    const [claimed] = await this.db
      .insert(schema.webhookEventLogs)
      .values({
        provider: event.provider,
        providerEventId: event.id,
        eventType: event.type,
        state: "processing",
        payloadHash: input.payloadHash,
        payload: input.payload,
        attemptCount: 1,
      })
      .onConflictDoUpdate({
        target: [schema.webhookEventLogs.provider, schema.webhookEventLogs.providerEventId],
        set: {
          state: "processing",
          payloadHash: input.payloadHash,
          payload: input.payload,
          attemptCount: sql`${schema.webhookEventLogs.attemptCount} + 1`,
          lastError: null,
        },
        setWhere: sql`${schema.webhookEventLogs.state} in ('received', 'failed')`,
      })
      .returning();

    if (claimed) {
      await this.persistProviderEvent(event);
      return { state: "claimed" };
    }

    const [existing] = await this.db
      .select()
      .from(schema.webhookEventLogs)
      .where(
        and(
          eq(schema.webhookEventLogs.provider, event.provider),
          eq(schema.webhookEventLogs.providerEventId, event.id),
        ),
      )
      .limit(1);

    if (existing?.state === "processed" || existing?.state === "ignored") {
      return { state: existing.state };
    }

    return { state: "processing_duplicate" };
  }

  async markProviderEventProcessed(event: EmailProviderEvent) {
    const processedAt = new Date();
    await this.db
      .update(schema.emailProviderEvents)
      .set({ processedAt })
      .where(eq(schema.emailProviderEvents.id, event.id));
    await this.markWebhookLog(event, "processed");
  }

  async markProviderEventFailed(event: EmailProviderEvent, errorMessage: string) {
    await this.markWebhookLog(event, "failed", errorMessage);
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

  private async persistProviderEvent(event: EmailProviderEvent) {
    await this.db
      .insert(schema.emailProviderEvents)
      .values({
        id: event.id,
        provider: event.provider,
        eventType: event.type,
        providerMessageId: event.providerMessageId,
        recipientEmail: event.recipientEmail,
        payload: event.payload,
        receivedAt: event.createdAt,
      })
      .onConflictDoNothing();
  }

  private async markWebhookLog(
    event: EmailProviderEvent,
    state: "processed" | "ignored" | "failed",
    lastError?: string,
  ) {
    await this.db
      .update(schema.webhookEventLogs)
      .set({
        state,
        lastError,
        processedAt: state === "processed" || state === "ignored" ? new Date() : undefined,
      })
      .where(
        and(
          eq(schema.webhookEventLogs.provider, event.provider),
          eq(schema.webhookEventLogs.providerEventId, event.id),
          eq(schema.webhookEventLogs.state, "processing"),
        ),
      );
  }
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
