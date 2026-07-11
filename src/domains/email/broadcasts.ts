import type { PostSummary } from "@/src/content/posts";
import { buildNewsletterPostEmail } from "./templates";
import type {
  CreateEmailBroadcastInput,
  EmailBroadcast,
  EmailBroadcastId,
  EmailBroadcastStatus,
  EmailBroadcastTarget,
  EmailMetadata,
  EmailProvider,
  EmailProviderKey,
  EmailSendResult,
  SendEmailBroadcastInput,
} from "./types";
import type { EmailSendService } from "./send-intents";

type NewsletterAudience = "public" | "free_subscribers" | "paid_any" | "specific_tiers";

export type NewsletterBroadcastOptions = {
  siteName: string;
  siteUrl: string;
  defaultPublicationId: string;
  broadcastSegmentIds?: Partial<Record<Exclude<NewsletterAudience, "specific_tiers">, string>>;
  tierSegmentIds?: Record<string, string>;
};

export function createNewsletterBroadcastFromPost(
  post: PostSummary,
  options: NewsletterBroadcastOptions,
): CreateEmailBroadcastInput | undefined {
  if (!post.newsletter?.enabled || post.publicationState !== "published") {
    return undefined;
  }

  const publicationId = post.publicationId ?? options.defaultPublicationId;
  const postUrl = new URL(`/posts/${post.slug}`, options.siteUrl).toString();
  const audience = resolveNewsletterAudience(post);
  const content = buildNewsletterPostEmail({
    siteName: options.siteName,
    siteUrl: options.siteUrl,
    postTitle: post.title,
    postUrl,
    excerpt: post.excerpt,
    subject: post.newsletter.subject,
    previewText: post.newsletter.previewText,
    unsubscribeHint: true,
  });

  return {
    publicationId,
    key: `post:${post.slug}`,
    content,
    target: targetForPost(post, audience, options),
    metadata: compactMetadata({
      postSlug: post.slug,
      sourcePath: "sourcePath" in post ? String(post.sourcePath) : null,
      visibility: post.visibility,
      audience,
    }),
  };
}

function targetForPost(
  post: PostSummary,
  audience: NewsletterAudience,
  options: NewsletterBroadcastOptions,
): EmailBroadcastTarget {
  if (audience === "specific_tiers") {
    return {
      segmentIds: [tierAudienceSegmentId(post.tierIds, options)],
    };
  }

  return { segmentIds: [options.broadcastSegmentIds?.[audience] ?? audience] };
}

function tierAudienceSegmentId(
  tierIds: readonly string[],
  options: NewsletterBroadcastOptions,
) {
  const normalizedTierIds = unique(tierIds.map((tierId) => tierId.trim()).filter(Boolean)).sort();

  if (normalizedTierIds.length === 0) {
    return options.tierSegmentIds?.specific_tiers ?? "specific_tiers";
  }

  if (normalizedTierIds.length === 1) {
    const tierId = normalizedTierIds[0]!;
    return options.tierSegmentIds?.[tierId] ?? `tier:${tierId}`;
  }

  const combinedKey = normalizedTierIds.join("+");
  return (
    options.tierSegmentIds?.[combinedKey] ??
    options.tierSegmentIds?.[`tiers:${combinedKey}`] ??
    `tiers:${combinedKey}`
  );
}

function resolveNewsletterAudience(post: PostSummary): NewsletterAudience {
  const audience = post.newsletter?.audience ?? post.visibility;

  if (isBroaderAudience(audience, post.visibility)) {
    throw new Error(
      `Newsletter audience ${audience} is broader than post visibility ${post.visibility}.`,
    );
  }

  return audience;
}

function isBroaderAudience(audience: NewsletterAudience, visibility: NewsletterAudience) {
  return accessRank(audience) < accessRank(visibility);
}

function accessRank(audience: NewsletterAudience) {
  switch (audience) {
    case "public":
      return 0;
    case "free_subscribers":
      return 1;
    case "paid_any":
      return 2;
    case "specific_tiers":
      return 3;
  }
}

export interface EmailBroadcastRepository {
  createOrGet(
    input: CreateEmailBroadcastInput & { provider: EmailProviderKey },
  ): Promise<EmailBroadcast>;
  findById(id: EmailBroadcastId): Promise<EmailBroadcast | undefined>;
  markProviderCreated(id: EmailBroadcastId, broadcast: EmailBroadcast): Promise<EmailBroadcast>;
  markSendResult(id: EmailBroadcastId, result: EmailSendResult): Promise<EmailBroadcast>;
  listBroadcasts(filter?: {
    publicationId?: string;
    status?: EmailBroadcastStatus;
  }): Promise<EmailBroadcast[]>;
}

export class InMemoryEmailBroadcastRepository implements EmailBroadcastRepository {
  private readonly broadcasts = new Map<string, EmailBroadcast>();
  private readonly keyIndex = new Map<string, string>();
  private nextId = 1;

  constructor(private readonly now: () => Date = () => new Date()) {}

  async createOrGet(
    input: CreateEmailBroadcastInput & { provider: EmailProviderKey },
  ): Promise<EmailBroadcast> {
    const indexedId = input.key
      ? this.keyIndex.get(`${input.publicationId}:${input.key}`)
      : undefined;

    if (indexedId) {
      return cloneBroadcast(this.broadcasts.get(indexedId)!);
    }

    const now = this.now();
    const broadcast: EmailBroadcast = {
      id: this.generateId("broadcast"),
      provider: input.provider,
      publicationId: input.publicationId,
      key: input.key,
      status: input.scheduledAt ? "scheduled" : "draft",
      from: input.from ? { ...input.from } : undefined,
      replyTo: input.replyTo ? { ...input.replyTo } : undefined,
      content: { ...input.content },
      target: cloneTarget(input.target),
      scheduledAt: cloneDate(input.scheduledAt),
      metadata: cloneMetadata(input.metadata),
      createdAt: now,
      updatedAt: now,
    };

    this.broadcasts.set(broadcast.id, broadcast);
    if (broadcast.key) {
      this.keyIndex.set(`${broadcast.publicationId}:${broadcast.key}`, broadcast.id);
    }

    return cloneBroadcast(broadcast);
  }

  async findById(id: EmailBroadcastId) {
    const broadcast = this.broadcasts.get(id);
    return broadcast ? cloneBroadcast(broadcast) : undefined;
  }

  async markProviderCreated(id: EmailBroadcastId, broadcast: EmailBroadcast) {
    const existing = this.requireBroadcast(id);
    const updated: EmailBroadcast = {
      ...existing,
      status: broadcast.status,
      from: broadcast.from ? { ...broadcast.from } : existing.from,
      replyTo: broadcast.replyTo ? { ...broadcast.replyTo } : existing.replyTo,
      providerBroadcastId: broadcast.providerBroadcastId ?? existing.providerBroadcastId,
      scheduledAt: cloneDate(broadcast.scheduledAt ?? existing.scheduledAt),
      sentAt: cloneDate(broadcast.sentAt ?? existing.sentAt),
      metadata: {
        ...(existing.metadata ?? {}),
        ...(broadcast.metadata ?? {}),
      },
      updatedAt: this.now(),
    };
    this.broadcasts.set(id, updated);
    return cloneBroadcast(updated);
  }

  async markSendResult(id: EmailBroadcastId, result: EmailSendResult) {
    const existing = this.requireBroadcast(id);
    const updated: EmailBroadcast = {
      ...existing,
      status: result.status === "sent" ? "sent" : existing.status,
      providerBroadcastId: result.providerBroadcastId ?? existing.providerBroadcastId,
      sentAt: cloneDate(result.sentAt ?? existing.sentAt),
      updatedAt: this.now(),
    };
    this.broadcasts.set(id, updated);
    return cloneBroadcast(updated);
  }

  async listBroadcasts(filter: { publicationId?: string; status?: EmailBroadcastStatus } = {}) {
    return Array.from(this.broadcasts.values())
      .filter((broadcast) => !filter.publicationId || broadcast.publicationId === filter.publicationId)
      .filter((broadcast) => !filter.status || broadcast.status === filter.status)
      .map(cloneBroadcast);
  }

  private requireBroadcast(id: EmailBroadcastId) {
    const broadcast = this.broadcasts.get(id);

    if (!broadcast) {
      throw new Error(`Email broadcast ${id} was not found.`);
    }

    return broadcast;
  }

  private generateId(prefix: string) {
    const id = `${prefix}_${this.nextId}`;
    this.nextId += 1;
    return id;
  }
}

export class EmailBroadcastService {
  constructor(
    private readonly repository: EmailBroadcastRepository,
    private readonly provider: EmailProvider,
    private readonly sendService: EmailSendService,
  ) {}

  async createDraft(input: CreateEmailBroadcastInput) {
    const localBroadcast = await this.repository.createOrGet({
      ...input,
      provider: this.provider.key,
    });

    if (localBroadcast.providerBroadcastId) {
      return localBroadcast;
    }

    const providerBroadcast = await this.provider.createBroadcast(input);
    return this.repository.markProviderCreated(localBroadcast.id, providerBroadcast);
  }

  async createDraftFromPost(post: PostSummary, options: NewsletterBroadcastOptions) {
    const input = createNewsletterBroadcastFromPost(post, options);
    return input ? this.createDraft(input) : undefined;
  }

  async sendBroadcast(input: Omit<SendEmailBroadcastInput, "intent" | "providerBroadcastId"> & {
    publicationId: string;
    dedupeKey: string;
  }) {
    const broadcast = await this.requireBroadcast(input.broadcastId);

    if (!broadcast.providerBroadcastId) {
      throw new Error(`Email broadcast ${broadcast.id} does not have a provider draft.`);
    }

    const result = await this.sendService.sendBroadcast({
      ...input,
      dedupeKey: broadcastSendDedupeKey(broadcast),
      providerBroadcastId: broadcast.providerBroadcastId,
    });

    await this.repository.markSendResult(broadcast.id, result);

    return {
      ...result,
      broadcastId: broadcast.id,
    };
  }

  private async requireBroadcast(id: EmailBroadcastId) {
    const broadcast = await this.repository.findById(id);

    if (!broadcast) {
      throw new Error(`Email broadcast ${id} was not found.`);
    }

    return broadcast;
  }
}

function broadcastSendDedupeKey(broadcast: EmailBroadcast) {
  return `broadcast:${broadcast.id}:send`;
}

function compactMetadata(metadata: EmailMetadata) {
  return Object.fromEntries(
    Object.entries(metadata).filter(([, value]) => value !== null),
  ) as EmailMetadata;
}

function unique(values: string[]) {
  return Array.from(new Set(values));
}

function cloneBroadcast(broadcast: EmailBroadcast): EmailBroadcast {
  return {
    ...broadcast,
    from: broadcast.from ? { ...broadcast.from } : undefined,
    replyTo: broadcast.replyTo ? { ...broadcast.replyTo } : undefined,
    content: { ...broadcast.content },
    target: cloneTarget(broadcast.target),
    scheduledAt: cloneDate(broadcast.scheduledAt),
    sentAt: cloneDate(broadcast.sentAt),
    metadata: cloneMetadata(broadcast.metadata),
    createdAt: new Date(broadcast.createdAt),
    updatedAt: new Date(broadcast.updatedAt),
  };
}

function cloneTarget(target: EmailBroadcastTarget): EmailBroadcastTarget {
  return {
    audienceIds: target.audienceIds ? [...target.audienceIds] : undefined,
    segmentIds: target.segmentIds ? [...target.segmentIds] : undefined,
    subscriberIds: target.subscriberIds ? [...target.subscriberIds] : undefined,
    excludeSubscriberIds: target.excludeSubscriberIds ? [...target.excludeSubscriberIds] : undefined,
  };
}

function cloneMetadata(metadata: EmailMetadata | undefined) {
  return metadata ? { ...metadata } : undefined;
}

function cloneDate(date: Date | undefined) {
  return date ? new Date(date) : undefined;
}
