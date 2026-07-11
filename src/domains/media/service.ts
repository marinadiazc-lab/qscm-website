import crypto from "node:crypto";
import path from "node:path";

import {
  assertAllowedMimeType,
  mediaKindForMimeType,
  readImageDimensions,
  resolveMimeType,
} from "./metadata";
import type { MediaStorageProvider } from "./provider";
import type { MediaRepository } from "./repository";
import type { MediaAsset, MediaAssetId, MediaUploadInput, MediaUploadResult } from "./types";

export type MediaIdFactory = () => MediaAssetId;

export interface MediaServiceOptions {
  idFactory?: MediaIdFactory;
  clock?: () => Date;
}

export class MediaService {
  private readonly idFactory: MediaIdFactory;
  private readonly clock: () => Date;

  constructor(
    private readonly repository: MediaRepository,
    private readonly storage: MediaStorageProvider,
    options: MediaServiceOptions = {},
  ) {
    this.idFactory = options.idFactory ?? defaultIdFactory;
    this.clock = options.clock ?? (() => new Date());
  }

  async registerUpload(input: MediaUploadInput): Promise<MediaUploadResult> {
    const now = input.now ?? this.clock();
    const access = input.access ?? "public";
    const mimeType = resolveMimeType(input.fileName, input.contentType);
    assertAllowedMimeType(mimeType);

    const kind = mediaKindForMimeType(mimeType);
    const checksumSha256 = sha256(input.body);
    const dimensions = readImageDimensions(input.body, mimeType);

    if (kind === "image" && !input.altText) {
      throw new Error("Image uploads require alt text before they can be registered.");
    }

    if (
      (kind === "audio" || kind === "video") &&
      input.durationSeconds !== undefined &&
      (!Number.isFinite(input.durationSeconds) || input.durationSeconds <= 0)
    ) {
      throw new Error("Audio and video duration must be a positive number of seconds.");
    }

    const objectKey = buildObjectKey({
      publicationId: input.publicationId,
      fileName: input.fileName,
      checksumSha256,
      now,
    });
    const stored = await this.storage.putObject({
      objectKey,
      body: input.body,
      contentType: mimeType,
      access,
    });

    const asset: MediaAsset = {
      id: this.idFactory(),
      publicationId: input.publicationId,
      kind,
      status: "ready",
      provider: stored.provider,
      objectKey: stored.objectKey,
      stablePath: stored.stablePath,
      publicUrl: access === "public" ? stored.publicUrl : undefined,
      access,
      originalFileName: input.fileName,
      title: input.title,
      altText: kind === "image" ? input.altText : undefined,
      mimeType,
      byteLength: input.body.byteLength,
      checksumSha256,
      width: dimensions?.width,
      height: dimensions?.height,
      durationSeconds: input.durationSeconds,
      metadata: input.metadata ?? {},
      lastReferencedAt: access === "public" ? now : undefined,
      createdAt: now,
      updatedAt: now,
    };

    try {
      return {
        asset: await this.repository.save(asset),
      };
    } catch (error) {
      try {
        await this.storage.deleteObject({
          objectKey: stored.objectKey,
          access,
        });
      } catch {
        // Preserve the repository failure for callers; cleanup is best effort.
      }

      throw error;
    }
  }

  async listRetentionCandidates(now = this.clock()) {
    return this.repository.listRetentionCandidates(now);
  }
}

export function buildObjectKey(input: {
  publicationId: string;
  fileName: string;
  checksumSha256: string;
  now: Date;
}) {
  const ext = path.extname(input.fileName).toLowerCase();
  const baseName = path
    .basename(input.fileName, ext)
    .normalize("NFKD")
    .replace(/[^\w.-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase() || "media";
  const month = input.now.toISOString().slice(0, 7);

  return `${input.publicationId}/${month}/${baseName}-${input.checksumSha256.slice(0, 12)}${ext}`;
}

function sha256(body: Buffer) {
  return crypto.createHash("sha256").update(body).digest("hex");
}

function defaultIdFactory() {
  return crypto.randomUUID();
}
