import { eq } from "drizzle-orm";

import type { DbClient } from "@/src/db";
import { schema } from "@/src/db";
import type { MediaRepository } from "./repository";
import type { MediaAsset, MediaAssetId, MediaRetentionCandidate } from "./types";

export class DrizzleMediaRepository implements MediaRepository {
  constructor(private readonly db: DbClient) {}

  async save(asset: MediaAsset): Promise<MediaAsset> {
    const [row] = await this.db
      .insert(schema.mediaAssets)
      .values(toRow(asset))
      .onConflictDoUpdate({
        target: schema.mediaAssets.id,
        set: toRow(asset),
      })
      .returning();

    return fromRow(row);
  }

  async findById(id: MediaAssetId): Promise<MediaAsset | undefined> {
    const [row] = await this.db
      .select()
      .from(schema.mediaAssets)
      .where(eq(schema.mediaAssets.id, id))
      .limit(1);

    return row ? fromRow(row) : undefined;
  }

  async findByStablePath(stablePath: string): Promise<MediaAsset | undefined> {
    const [row] = await this.db
      .select()
      .from(schema.mediaAssets)
      .where(eq(schema.mediaAssets.stablePath, stablePath))
      .limit(1);

    return row ? fromRow(row) : undefined;
  }

  async listRetentionCandidates(now: Date): Promise<MediaRetentionCandidate[]> {
    const rows = await this.db.select().from(schema.mediaAssets);

    return rows.flatMap<MediaRetentionCandidate>((row) => {
      const asset = fromRow(row);

      if (asset.deletedAt) {
        return [];
      }

      if (asset.archivedAt && daysBetween(asset.archivedAt, now) >= 30) {
        return [{ asset, reason: "archived_expired" as const }];
      }

      if (
        asset.access === "public" &&
        asset.lastReferencedAt &&
        daysBetween(asset.lastReferencedAt, now) >= 180
      ) {
        return [{ asset, reason: "unreferenced_public_asset" as const }];
      }

      return [];
    });
  }
}

function toRow(asset: MediaAsset): typeof schema.mediaAssets.$inferInsert {
  return {
    id: asset.id,
    publicationId: asset.publicationId,
    kind: asset.kind,
    status: asset.status,
    provider: asset.provider,
    objectKey: asset.objectKey,
    stablePath: asset.stablePath,
    publicUrl: asset.publicUrl,
    access: asset.access,
    originalFileName: asset.originalFileName,
    title: asset.title,
    altText: asset.altText,
    mimeType: asset.mimeType,
    byteLength: asset.byteLength,
    checksumSha256: asset.checksumSha256,
    width: asset.width,
    height: asset.height,
    durationSeconds: asset.durationSeconds,
    metadata: asset.metadata,
    lastReferencedAt: asset.lastReferencedAt,
    archivedAt: asset.archivedAt,
    deletedAt: asset.deletedAt,
    createdAt: asset.createdAt,
    updatedAt: asset.updatedAt,
  };
}

function fromRow(row: typeof schema.mediaAssets.$inferSelect): MediaAsset {
  return {
    id: row.id,
    publicationId: row.publicationId,
    kind: row.kind,
    status: row.status,
    provider: row.provider,
    objectKey: row.objectKey,
    stablePath: row.stablePath,
    publicUrl: row.publicUrl ?? undefined,
    access: row.access,
    originalFileName: row.originalFileName ?? undefined,
    title: row.title ?? undefined,
    altText: row.altText ?? undefined,
    mimeType: row.mimeType ?? undefined,
    byteLength: row.byteLength ?? undefined,
    checksumSha256: row.checksumSha256 ?? undefined,
    width: row.width ?? undefined,
    height: row.height ?? undefined,
    durationSeconds: row.durationSeconds ?? undefined,
    metadata: row.metadata,
    lastReferencedAt: row.lastReferencedAt ?? undefined,
    archivedAt: row.archivedAt ?? undefined,
    deletedAt: row.deletedAt ?? undefined,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function daysBetween(left: Date, right: Date) {
  return Math.floor((right.getTime() - left.getTime()) / 86_400_000);
}
