import type { MediaAsset, MediaAssetId, MediaRetentionCandidate } from "./types";

export interface MediaRepository {
  save(asset: MediaAsset): Promise<MediaAsset>;
  findById(id: MediaAssetId): Promise<MediaAsset | undefined>;
  findByStablePath(stablePath: string): Promise<MediaAsset | undefined>;
  listRetentionCandidates(now: Date): Promise<MediaRetentionCandidate[]>;
}

export class InMemoryMediaRepository implements MediaRepository {
  private readonly assets = new Map<MediaAssetId, MediaAsset>();

  constructor(seedAssets: readonly MediaAsset[] = []) {
    seedAssets.forEach((asset) => {
      this.assets.set(asset.id, cloneAsset(asset));
    });
  }

  async save(asset: MediaAsset): Promise<MediaAsset> {
    const stored = cloneAsset(asset);
    this.assets.set(stored.id, stored);
    return cloneAsset(stored);
  }

  async findById(id: MediaAssetId): Promise<MediaAsset | undefined> {
    const asset = this.assets.get(id);

    return asset ? cloneAsset(asset) : undefined;
  }

  async findByStablePath(stablePath: string): Promise<MediaAsset | undefined> {
    const asset = Array.from(this.assets.values()).find((candidate) => candidate.stablePath === stablePath);

    return asset ? cloneAsset(asset) : undefined;
  }

  async listRetentionCandidates(now: Date): Promise<MediaRetentionCandidate[]> {
    return Array.from(this.assets.values()).flatMap<MediaRetentionCandidate>((asset) => {
      if (asset.deletedAt) {
        return [];
      }

      if (asset.archivedAt && daysBetween(asset.archivedAt, now) >= 30) {
        return [{ asset: cloneAsset(asset), reason: "archived_expired" as const }];
      }

      if (
        asset.access === "public" &&
        asset.lastReferencedAt &&
        daysBetween(asset.lastReferencedAt, now) >= 180
      ) {
        return [{ asset: cloneAsset(asset), reason: "unreferenced_public_asset" as const }];
      }

      return [];
    });
  }
}

function cloneAsset(asset: MediaAsset): MediaAsset {
  return {
    ...asset,
    metadata: { ...asset.metadata },
    createdAt: new Date(asset.createdAt),
    updatedAt: new Date(asset.updatedAt),
    lastReferencedAt: asset.lastReferencedAt ? new Date(asset.lastReferencedAt) : undefined,
    archivedAt: asset.archivedAt ? new Date(asset.archivedAt) : undefined,
    deletedAt: asset.deletedAt ? new Date(asset.deletedAt) : undefined,
  };
}

function daysBetween(left: Date, right: Date) {
  return Math.floor((right.getTime() - left.getTime()) / 86_400_000);
}
