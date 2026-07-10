export type MediaAssetId = string;
export type MediaAssetKind = "image" | "audio" | "video" | "document" | "other";
export type MediaAssetStatus = "pending" | "ready" | "failed" | "archived";
export type MediaAssetAccess = "public" | "admin" | "entitled";
export type MediaProviderName = "local" | "vercel_blob" | "s3";

export interface MediaDimensions {
  width: number;
  height: number;
}

export interface MediaAsset {
  id: MediaAssetId;
  publicationId: string;
  kind: MediaAssetKind;
  status: MediaAssetStatus;
  provider: MediaProviderName | string;
  objectKey: string;
  stablePath: string;
  publicUrl?: string;
  access: MediaAssetAccess;
  originalFileName?: string;
  title?: string;
  altText?: string;
  mimeType?: string;
  byteLength?: number;
  checksumSha256?: string;
  width?: number;
  height?: number;
  durationSeconds?: number;
  metadata: Record<string, unknown>;
  lastReferencedAt?: Date;
  archivedAt?: Date;
  deletedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface MediaUploadInput {
  publicationId: string;
  fileName: string;
  contentType?: string;
  body: Buffer;
  access?: MediaAssetAccess;
  title?: string;
  altText?: string;
  durationSeconds?: number;
  metadata?: Record<string, unknown>;
  now?: Date;
}

export interface MediaUploadResult {
  asset: MediaAsset;
}

export interface MediaRetentionCandidate {
  asset: MediaAsset;
  reason: "archived_expired" | "unreferenced_public_asset";
}
