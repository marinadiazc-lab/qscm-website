import { createResendEmailProviderFromEnv, type EmailProvider } from "@/src/domains/email";
import type { SubscriberRepository } from "./service";
import type {
  SubscriberMetadata,
  SubscriberPreferences,
  SubscriberProviderSync,
  SubscriberRecord,
} from "./types";

export type ResendSubscriberSyncConfig = {
  provider?: "resend";
  limit?: number;
  freeAudienceId?: string;
  paidAudienceId?: string;
  suppressedAudienceId?: string;
  tierAudienceIds?: Record<string, string>;
  now?: () => Date;
};

export type SubscriberSyncWorkerResult = {
  processed: number;
  synced: number;
  failed: number;
};

export class ResendSubscriberSyncWorker {
  private readonly providerKey = "resend";
  private readonly limit: number;
  private readonly now: () => Date;

  constructor(
    private readonly repository: SubscriberRepository,
    private readonly emailProvider: Pick<EmailProvider, "upsertContact">,
    private readonly config: ResendSubscriberSyncConfig = {},
  ) {
    this.limit = config.limit ?? 50;
    this.now = config.now ?? (() => new Date());
  }

  async runPending(): Promise<SubscriberSyncWorkerResult> {
    if (!this.repository.listPendingProviderSyncs) {
      throw new Error("Subscriber repository cannot list pending provider sync rows.");
    }

    const pending = await this.repository.listPendingProviderSyncs(this.providerKey, this.limit);
    let synced = 0;
    let failed = 0;

    for (const sync of pending) {
      const result = await this.syncOne(sync);

      if (result === "synced") {
        synced += 1;
      } else {
        failed += 1;
      }
    }

    return {
      processed: pending.length,
      synced,
      failed,
    };
  }

  private async syncOne(sync: SubscriberProviderSync): Promise<"synced" | "failed"> {
    const now = this.now();

    try {
      const subscriber = await this.repository.findSubscriberById(sync.subscriberId);

      if (!subscriber) {
        throw new Error(`Subscriber ${sync.subscriberId} was not found.`);
      }

      const preferences = await this.repository.findPreferences(subscriber.id);
      const target = mapSubscriberSyncTarget(subscriber, preferences, this.config);
      const audienceIds = target.audienceIds.slice(0, 1);
      const contact = await this.emailProvider.upsertContact({
        publicationId: subscriber.publicationId,
        subscriberId: subscriber.id,
        userId: subscriber.userId,
        providerContactId: sync.providerContactId,
        email: subscriber.email,
        name: stringMetadata(subscriber.metadata, "name"),
        status: subscriber.status,
        ...(audienceIds.length > 0 ? { audienceIds } : {}),
      });

      await this.repository.saveProviderSync({
        ...sync,
        providerContactId: contact.id,
        syncStatus: "synced",
        lastSyncedAt: now,
        lastError: undefined,
        metadata: {
          ...sync.metadata,
          audienceIds: contact.audienceIds,
          syncedReason: sync.metadata.pendingReason,
        },
        updatedAt: now,
      });

      return "synced";
    } catch (error) {
      await this.repository.saveProviderSync({
        ...sync,
        syncStatus: "failed",
        lastError: errorMessage(error),
        updatedAt: now,
      });

      return "failed";
    }
  }
}

export function mapSubscriberSyncTarget(
  subscriber: SubscriberRecord,
  preferences: SubscriberPreferences | undefined,
  config: ResendSubscriberSyncConfig,
) {
  const suppressed =
    subscriber.status !== "active" ||
    preferences?.marketingEmailOptIn === false ||
    preferences?.productEmailOptIn === false;
  const tier = firstStringMetadata(subscriber.metadata, ["tier", "tierSlug", "subscriptionTier"]);
  const paid = booleanMetadata(subscriber.metadata, "paidSubscriber") || Boolean(tier);
  const audienceIds = [
    suppressed ? config.suppressedAudienceId : undefined,
    paid ? config.paidAudienceId : config.freeAudienceId,
    tier ? config.tierAudienceIds?.[tier] : undefined,
  ].filter(Boolean) as string[];

  return {
    audienceIds,
    suppressed,
    paid,
    tier,
  };
}

export async function createResendSubscriberSyncWorkerFromEnv(
  env: NodeJS.ProcessEnv = process.env,
) {
  const { DatabaseSubscriberRepository } = await import("./database-repository");

  return new ResendSubscriberSyncWorker(
    new DatabaseSubscriberRepository(),
    createResendEmailProviderFromEnv(env),
    {
      freeAudienceId: env.RESEND_FREE_SUBSCRIBER_AUDIENCE_ID ?? env.RESEND_DEFAULT_AUDIENCE_ID,
      paidAudienceId: env.RESEND_PAID_SUBSCRIBER_AUDIENCE_ID,
      suppressedAudienceId: env.RESEND_SUPPRESSED_SUBSCRIBER_AUDIENCE_ID,
    },
  );
}

function stringMetadata(metadata: SubscriberMetadata, key: string) {
  const value = metadata[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function firstStringMetadata(metadata: SubscriberMetadata, keys: string[]) {
  for (const key of keys) {
    const value = stringMetadata(metadata, key);

    if (value) {
      return value;
    }
  }

  return undefined;
}

function booleanMetadata(metadata: SubscriberMetadata, key: string) {
  return metadata[key] === true;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Subscriber provider sync failed.";
}
