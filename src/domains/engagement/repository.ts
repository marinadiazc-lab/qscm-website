import { and, count, desc, eq, gte, sql, type SQL } from "drizzle-orm";
import type { db } from "@/src/db";
import * as schema from "@/src/db/schema";
import type { ModerationAuditEntry, ModerationDecision, ModerationStatus } from "../moderation";
import type {
  EngagementActor,
  EngagementComment,
  EngagementPostMetadata,
  EngagementRequestContext,
  ModerationQueueItem,
  ShareChannel,
} from "./types";

export type DbClient = typeof db;

export type StoreCommentInput = {
  postSlug: string;
  body: string;
  authorKind: "anonymous" | "registered_user";
  authorDisplayName: string;
  authorEmail?: string;
  authorWebsite?: string;
  registeredUserId?: string;
  moderationStatus: ModerationStatus;
  moderationAudit: ModerationAuditEntry[];
  requestContext?: EngagementRequestContext;
  now: Date;
};

export type StoreShareInput = {
  postSlug: string;
  channel: ShareChannel;
  actor: EngagementActor;
  requestContext?: EngagementRequestContext;
  now: Date;
};

export type EngagementRateLimitScope = {
  postSlug?: string;
  anonymousActorHash?: string;
  ipHash?: string;
  emailHash?: string;
  registeredUserId?: string;
};

export interface EngagementRepository {
  postExists(postSlug: string): Promise<boolean>;
  listApprovedComments(postSlug: string): Promise<EngagementComment[]>;
  listModerationQueue(status?: ModerationStatus): Promise<ModerationQueueItem[]>;
  storeComment(input: StoreCommentInput): Promise<EngagementComment | undefined>;
  countRecentComments(scope: EngagementRateLimitScope, since: Date): Promise<number>;
  countRecentShares(scope: EngagementRateLimitScope, since: Date): Promise<number>;
  countRecentLikes(scope: EngagementRateLimitScope, since: Date): Promise<number>;
  hasLiked(postSlug: string, actor: EngagementActor): Promise<boolean>;
  likePost(postSlug: string, actor: EngagementActor, now: Date): Promise<boolean>;
  countLikes(postSlug: string): Promise<number>;
  storeShare(input: StoreShareInput): Promise<boolean>;
}

export type EngagementPostMetadataResolver = (
  postSlug: string,
) => EngagementPostMetadata | undefined;

export type PostgresEngagementRepositoryOptions = {
  resolvePostMetadata?: EngagementPostMetadataResolver;
  publicationSlug?: string;
};

export class PostgresEngagementRepository implements EngagementRepository {
  private readonly resolvePostMetadata?: EngagementPostMetadataResolver;
  private readonly publicationSlug: string;

  constructor(
    private readonly db: DbClient,
    options: PostgresEngagementRepositoryOptions = {},
  ) {
    this.resolvePostMetadata = options.resolvePostMetadata;
    this.publicationSlug = options.publicationSlug ?? "qscm";
  }

  async postExists(postSlug: string): Promise<boolean> {
    return Boolean(await this.findOrCreatePostId(postSlug));
  }

  async listApprovedComments(postSlug: string): Promise<EngagementComment[]> {
    const rows = await this.db
      .select({
        id: schema.comments.id,
        body: schema.comments.body,
        authorKind: schema.comments.authorKind,
        authorDisplayName: schema.comments.authorDisplayName,
        moderationStatus: schema.comments.moderationStatus,
        createdAt: schema.comments.createdAt,
        publishedAt: schema.comments.publishedAt,
      })
      .from(schema.comments)
      .innerJoin(schema.postMetadata, eq(schema.comments.postId, schema.postMetadata.id))
      .where(
        and(
          eq(schema.postMetadata.slug, postSlug),
          eq(schema.comments.moderationStatus, "approved"),
        ),
      )
      .orderBy(schema.comments.createdAt);

    return rows.map((row) => toPublicComment(postSlug, row));
  }

  async listModerationQueue(status: ModerationStatus = "suspicious"): Promise<ModerationQueueItem[]> {
    const rows = await this.db
      .select({
        id: schema.comments.id,
        postSlug: schema.postMetadata.slug,
        body: schema.comments.body,
        authorKind: schema.comments.authorKind,
        authorDisplayName: schema.comments.authorDisplayName,
        authorEmail: schema.comments.authorEmail,
        authorWebsite: schema.comments.authorWebsite,
        registeredUserId: schema.comments.registeredUserId,
        moderationStatus: schema.comments.moderationStatus,
        requestContext: schema.comments.requestContext,
        createdAt: schema.comments.createdAt,
        publishedAt: schema.comments.publishedAt,
      })
      .from(schema.comments)
      .innerJoin(schema.postMetadata, eq(schema.comments.postId, schema.postMetadata.id))
      .where(eq(schema.comments.moderationStatus, status))
      .orderBy(desc(schema.comments.createdAt));

    const items: ModerationQueueItem[] = [];
    for (const row of rows) {
      const auditRows = await this.db
        .select({
          decision: schema.moderationAuditEntries.decision,
          checkedAt: schema.moderationAuditEntries.checkedAt,
        })
        .from(schema.moderationAuditEntries)
        .where(eq(schema.moderationAuditEntries.commentId, row.id))
        .orderBy(schema.moderationAuditEntries.checkedAt);

      items.push({
        ...toPublicComment(row.postSlug, row),
        privateFields: {
          email: row.authorEmail ?? undefined,
          website: row.authorWebsite ?? undefined,
          registeredUserId: row.registeredUserId ?? undefined,
        },
        moderationAudit: auditRows.map((audit) => ({
          decision: audit.decision as unknown as ModerationDecision,
          checkedAt: audit.checkedAt,
        })),
        requestContext: row.requestContext as EngagementRequestContext | undefined,
      });
    }

    return items;
  }

  async storeComment(input: StoreCommentInput): Promise<EngagementComment | undefined> {
    const postId = await this.findOrCreatePostId(input.postSlug);
    if (!postId) return undefined;

    const [comment] = await this.db
      .insert(schema.comments)
      .values({
        postId,
        body: input.body,
        authorKind: input.authorKind,
        authorDisplayName: input.authorDisplayName,
        authorEmail: input.authorEmail,
        authorWebsite: input.authorWebsite,
        registeredUserId: input.registeredUserId,
        moderationStatus: input.moderationStatus,
        requestContext: input.requestContext as Record<string, unknown> | undefined,
        createdAt: input.now,
        updatedAt: input.now,
        publishedAt: input.moderationStatus === "approved" ? input.now : undefined,
      })
      .returning();

    if (input.moderationAudit.length > 0) {
      await this.db.insert(schema.moderationAuditEntries).values(
        input.moderationAudit.map((entry) => ({
          commentId: comment.id,
          source: entry.decision.source,
          outcome: entry.decision.outcome,
          reason: entry.decision.reason,
          score: entry.decision.score?.toString(),
          decision: entry.decision as unknown as Record<string, unknown>,
          checkedAt: entry.checkedAt,
        })),
      );
    }

    return toPublicComment(input.postSlug, comment);
  }

  async countRecentComments(scope: EngagementRateLimitScope, since: Date): Promise<number> {
    const scopeConditions = commentScopeConditions(scope);
    let maxCount = 0;

    for (const condition of scopeConditions) {
      const [row] = await this.db
        .select({ value: count() })
        .from(schema.comments)
        .innerJoin(schema.postMetadata, eq(schema.comments.postId, schema.postMetadata.id))
        .where(
          and(
            gte(schema.comments.createdAt, since),
            scope.postSlug ? eq(schema.postMetadata.slug, scope.postSlug) : undefined,
            condition,
          ),
        );

      maxCount = Math.max(maxCount, row?.value ?? 0);
    }

    return maxCount;
  }

  async countRecentShares(scope: EngagementRateLimitScope, since: Date): Promise<number> {
    const scopeConditions = shareScopeConditions(scope);
    let maxCount = 0;

    for (const condition of scopeConditions) {
      const [row] = await this.db
        .select({ value: count() })
        .from(schema.postShares)
        .innerJoin(schema.postMetadata, eq(schema.postShares.postId, schema.postMetadata.id))
        .where(
          and(
            gte(schema.postShares.createdAt, since),
            scope.postSlug ? eq(schema.postMetadata.slug, scope.postSlug) : undefined,
            condition,
          ),
        );

      maxCount = Math.max(maxCount, row?.value ?? 0);
    }

    return maxCount;
  }

  async countRecentLikes(scope: EngagementRateLimitScope, since: Date): Promise<number> {
    const scopeConditions = reactionScopeConditions(scope);
    let maxCount = 0;

    if (scopeConditions.length === 0 && scope.postSlug) {
      const [row] = await this.db
        .select({ value: count() })
        .from(schema.postReactions)
        .innerJoin(schema.postMetadata, eq(schema.postReactions.postId, schema.postMetadata.id))
        .where(
          and(
            gte(schema.postReactions.createdAt, since),
            eq(schema.postMetadata.slug, scope.postSlug),
          ),
        );

      return row?.value ?? 0;
    }

    for (const condition of scopeConditions) {
      const [row] = await this.db
        .select({ value: count() })
        .from(schema.postReactions)
        .where(and(gte(schema.postReactions.createdAt, since), condition));

      maxCount = Math.max(maxCount, row?.value ?? 0);
    }

    return maxCount;
  }

  async hasLiked(postSlug: string, actor: EngagementActor): Promise<boolean> {
    const postId = await this.findOrCreatePostId(postSlug);
    if (!postId) return false;

    const [row] = await this.db
      .select({ id: schema.postReactions.id })
      .from(schema.postReactions)
      .where(and(eq(schema.postReactions.postId, postId), actorWhere(actor)))
      .limit(1);

    return Boolean(row);
  }

  async likePost(postSlug: string, actor: EngagementActor, now: Date): Promise<boolean> {
    const postId = await this.findOrCreatePostId(postSlug);
    if (!postId) return false;

    await this.db
      .insert(schema.postReactions)
      .values({
        postId,
        kind: "like",
        userId: actor.kind === "registered_user" ? actor.userId : undefined,
        anonymousActorHash: actor.anonymousActorHash,
        createdAt: now,
      })
      .onConflictDoNothing();

    return true;
  }

  async countLikes(postSlug: string): Promise<number> {
    const postId = await this.findOrCreatePostId(postSlug);
    if (!postId) return 0;

    const [row] = await this.db
      .select({ value: count() })
      .from(schema.postReactions)
      .where(and(eq(schema.postReactions.postId, postId), eq(schema.postReactions.kind, "like")));

    return row?.value ?? 0;
  }

  async storeShare(input: StoreShareInput): Promise<boolean> {
    const postId = await this.findOrCreatePostId(input.postSlug);
    if (!postId) return false;

    await this.db.insert(schema.postShares).values({
      postId,
      channel: input.channel,
      userId: input.actor.kind === "registered_user" ? input.actor.userId : undefined,
      anonymousActorHash: input.actor.anonymousActorHash,
      requestContext: input.requestContext as Record<string, unknown> | undefined,
      createdAt: input.now,
    });

    return true;
  }

  private async findPostId(postSlug: string): Promise<string | undefined> {
    const [post] = await this.db
      .select({ id: schema.postMetadata.id })
      .from(schema.postMetadata)
      .where(eq(schema.postMetadata.slug, postSlug))
      .limit(1);

    return post?.id;
  }

  private async findOrCreatePostId(postSlug: string): Promise<string | undefined> {
    const existingPostId = await this.findPostId(postSlug);
    if (existingPostId) return existingPostId;

    const metadata = this.resolvePostMetadata?.(postSlug);
    if (!metadata) return undefined;

    const [publication] = await this.db
      .insert(schema.publications)
      .values({
        slug: this.publicationSlug,
        name: "QSCM",
        description: "The first QSCM publication.",
        status: "active",
      })
      .onConflictDoUpdate({
        target: schema.publications.slug,
        set: {
          status: "active",
          updatedAt: new Date(),
        },
      })
      .returning();

    const [post] = await this.db
      .insert(schema.postMetadata)
      .values({
        publicationId: publication.id,
        slug: metadata.slug,
        sourcePath: metadata.sourcePath,
        sourceHash: metadata.sourceHash,
        title: metadata.title,
        excerpt: metadata.excerpt,
        author: metadata.author,
        status: metadata.status,
        visibility: metadata.visibility,
        canonicalUrl: metadata.canonicalUrl,
        publishedAt: metadata.publishedAt,
        mdxUpdatedAt: metadata.updatedAt,
        tags: metadata.tags,
      })
      .onConflictDoUpdate({
        target: [schema.postMetadata.publicationId, schema.postMetadata.slug],
        set: {
          sourcePath: metadata.sourcePath,
          sourceHash: metadata.sourceHash,
          title: metadata.title,
          excerpt: metadata.excerpt,
          author: metadata.author,
          status: metadata.status,
          visibility: metadata.visibility,
          canonicalUrl: metadata.canonicalUrl,
          publishedAt: metadata.publishedAt,
          mdxUpdatedAt: metadata.updatedAt,
          tags: metadata.tags,
          updatedAt: new Date(),
        },
      })
      .returning();

    return post.id;
  }
}

export class InMemoryEngagementRepository implements EngagementRepository {
  private readonly knownPosts = new Set<string>();
  private readonly comments: (StoreCommentInput & { id: string })[] = [];
  private readonly likes = new Set<string>();
  private readonly likeEvents: { actorHash: string; postSlug: string; createdAt: Date }[] = [];
  private readonly shares: StoreShareInput[] = [];
  private nextId = 1;

  constructor(postSlugs: readonly string[] = []) {
    postSlugs.forEach((slug) => this.knownPosts.add(slug));
  }

  async postExists(postSlug: string): Promise<boolean> {
    return this.knownPosts.size === 0 || this.knownPosts.has(postSlug);
  }

  async listApprovedComments(postSlug: string): Promise<EngagementComment[]> {
    return this.comments
      .filter((comment) => comment.postSlug === postSlug && comment.moderationStatus === "approved")
      .sort((a, b) => a.now.getTime() - b.now.getTime())
      .map((comment) => storedInputToComment(comment.id, comment));
  }

  async listModerationQueue(status: ModerationStatus = "suspicious"): Promise<ModerationQueueItem[]> {
    return this.comments
      .filter((comment) => comment.moderationStatus === status)
      .map((comment) => ({
        ...storedInputToComment(comment.id, comment),
        privateFields: {
          email: comment.authorEmail,
          website: comment.authorWebsite,
          registeredUserId: comment.registeredUserId,
        },
        moderationAudit: comment.moderationAudit,
        requestContext: comment.requestContext,
      }));
  }

  async storeComment(input: StoreCommentInput): Promise<EngagementComment | undefined> {
    if (!(await this.postExists(input.postSlug))) return undefined;

    const stored = { ...input, id: `comment_${this.nextId++}` };
    this.comments.push(stored);
    return storedInputToComment(stored.id, stored);
  }

  async countRecentComments(scope: EngagementRateLimitScope, since: Date): Promise<number> {
    return maxCountByScope(
      this.comments.filter((comment) => comment.now >= since),
      scope,
      (comment) => ({
        postSlug: comment.postSlug,
        anonymousActorHash: comment.requestContext?.anonymousActorHash,
        ipHash: comment.requestContext?.ipHash,
        emailHash: comment.requestContext?.emailHash,
        registeredUserId: comment.registeredUserId,
      }),
    );
  }

  async countRecentShares(scope: EngagementRateLimitScope, since: Date): Promise<number> {
    return maxCountByScope(
      this.shares.filter((share) => share.now >= since),
      scope,
      (share) => ({
        postSlug: share.postSlug,
        anonymousActorHash: share.actor.anonymousActorHash,
        ipHash: share.requestContext?.ipHash,
        emailHash: share.requestContext?.emailHash,
        registeredUserId: share.actor.kind === "registered_user" ? share.actor.userId : undefined,
      }),
    );
  }

  async countRecentLikes(scope: EngagementRateLimitScope, since: Date): Promise<number> {
    const scopeKeys = [
      scope.anonymousActorHash,
      scope.registeredUserId,
    ].filter((value): value is string => Boolean(value));

    if (scopeKeys.length === 0 && scope.postSlug) {
      return this.likeEvents.filter(
        (event) => event.postSlug === scope.postSlug && event.createdAt >= since,
      ).length;
    }

    return Math.max(
      0,
      ...scopeKeys.map(
        (scopeKey) =>
          this.likeEvents.filter(
            (event) => event.actorHash === scopeKey && event.createdAt >= since,
          ).length,
      ),
    );
  }

  async hasLiked(postSlug: string, actor: EngagementActor): Promise<boolean> {
    return this.likes.has(likeKey(postSlug, actor));
  }

  async likePost(postSlug: string, actor: EngagementActor, now: Date): Promise<boolean> {
    if (!(await this.postExists(postSlug))) return false;

    this.likes.add(likeKey(postSlug, actor));
    this.likeEvents.push({ actorHash: actorRateLimitKey(actor), postSlug, createdAt: now });
    return true;
  }

  async countLikes(postSlug: string): Promise<number> {
    return Array.from(this.likes).filter((key) => key.startsWith(`${postSlug}:`)).length;
  }

  async storeShare(input: StoreShareInput): Promise<boolean> {
    if (!(await this.postExists(input.postSlug))) return false;

    this.shares.push({ ...input });
    return true;
  }
}

type CommentRow = {
  id: string;
  body: string;
  authorKind: "anonymous" | "registered_user";
  authorDisplayName: string;
  moderationStatus: ModerationStatus;
  createdAt: Date;
  publishedAt?: Date | null;
};

function toPublicComment(postSlug: string, row: CommentRow): EngagementComment {
  return {
    id: row.id,
    postSlug,
    body: row.body,
    commenter: {
      kind: row.authorKind,
      displayName: row.authorDisplayName,
    },
    moderationStatus: row.moderationStatus,
    createdAt: row.createdAt,
    publishedAt: row.publishedAt ?? undefined,
  };
}

function storedInputToComment(id: string, input: StoreCommentInput): EngagementComment {
  return {
    id,
    postSlug: input.postSlug,
    body: input.body,
    commenter: {
      kind: input.authorKind,
      displayName: input.authorDisplayName,
    },
    moderationStatus: input.moderationStatus,
    createdAt: input.now,
    publishedAt: input.moderationStatus === "approved" ? input.now : undefined,
  };
}

function actorWhere(actor: EngagementActor) {
  if (actor.kind === "registered_user") {
    return eq(schema.postReactions.userId, actor.userId);
  }

  return eq(schema.postReactions.anonymousActorHash, actor.anonymousActorHash);
}

function commentScopeConditions(scope: EngagementRateLimitScope) {
  const conditions: SQL[] = [];

  if (scope.anonymousActorHash) {
    conditions.push(
      sql`${schema.comments.requestContext}->>'anonymousActorHash' = ${scope.anonymousActorHash}`,
    );
  }
  if (scope.ipHash) {
    conditions.push(sql`${schema.comments.requestContext}->>'ipHash' = ${scope.ipHash}`);
  }
  if (scope.emailHash) {
    conditions.push(sql`${schema.comments.requestContext}->>'emailHash' = ${scope.emailHash}`);
  }
  if (scope.registeredUserId) {
    conditions.push(eq(schema.comments.registeredUserId, scope.registeredUserId));
  }
  if (conditions.length === 0 && scope.postSlug) {
    conditions.push(sql`true`);
  }

  return conditions;
}

function shareScopeConditions(scope: EngagementRateLimitScope) {
  const conditions: SQL[] = [];

  if (scope.anonymousActorHash) {
    conditions.push(eq(schema.postShares.anonymousActorHash, scope.anonymousActorHash));
  }
  if (scope.ipHash) {
    conditions.push(sql`${schema.postShares.requestContext}->>'ipHash' = ${scope.ipHash}`);
  }
  if (scope.emailHash) {
    conditions.push(sql`${schema.postShares.requestContext}->>'emailHash' = ${scope.emailHash}`);
  }
  if (scope.registeredUserId) {
    conditions.push(eq(schema.postShares.userId, scope.registeredUserId));
  }
  if (conditions.length === 0 && scope.postSlug) {
    conditions.push(sql`true`);
  }

  return conditions;
}

function reactionScopeConditions(scope: EngagementRateLimitScope) {
  const conditions: SQL[] = [];

  if (scope.anonymousActorHash) {
    conditions.push(eq(schema.postReactions.anonymousActorHash, scope.anonymousActorHash));
  }
  if (scope.registeredUserId) {
    conditions.push(eq(schema.postReactions.userId, scope.registeredUserId));
  }

  return conditions;
}

function maxCountByScope<T>(
  items: T[],
  scope: EngagementRateLimitScope,
  project: (item: T) => EngagementRateLimitScope,
) {
  const scopeMatchers: Array<(itemScope: EngagementRateLimitScope) => boolean> = [];

  if (scope.anonymousActorHash) {
    scopeMatchers.push((itemScope) => itemScope.anonymousActorHash === scope.anonymousActorHash);
  }
  if (scope.ipHash) {
    scopeMatchers.push((itemScope) => itemScope.ipHash === scope.ipHash);
  }
  if (scope.emailHash) {
    scopeMatchers.push((itemScope) => itemScope.emailHash === scope.emailHash);
  }
  if (scope.registeredUserId) {
    scopeMatchers.push((itemScope) => itemScope.registeredUserId === scope.registeredUserId);
  }
  if (scopeMatchers.length === 0 && scope.postSlug) {
    scopeMatchers.push((itemScope) => itemScope.postSlug === scope.postSlug);
  }

  return Math.max(
    0,
    ...scopeMatchers.map(
      (matches) =>
        items.filter((item) => {
          const itemScope = project(item);
          return (!scope.postSlug || itemScope.postSlug === scope.postSlug) && matches(itemScope);
        }).length,
    ),
  );
}

function likeKey(postSlug: string, actor: EngagementActor) {
  return `${postSlug}:${actor.kind === "registered_user" ? actor.userId : actor.anonymousActorHash}`;
}

function actorRateLimitKey(actor: EngagementActor) {
  return actor.kind === "registered_user" ? actor.userId : actor.anonymousActorHash;
}
