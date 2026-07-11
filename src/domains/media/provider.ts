import fs from "node:fs/promises";
import path from "node:path";

import type { MediaAssetAccess, MediaProviderName } from "./types";

export interface StoreMediaObjectInput {
  objectKey: string;
  body: Buffer;
  contentType: string;
  access: MediaAssetAccess;
}

export interface StoredMediaObject {
  provider: MediaProviderName | string;
  objectKey: string;
  stablePath: string;
  publicUrl?: string;
}

export interface MediaStorageProvider {
  readonly name: MediaProviderName | string;
  putObject(input: StoreMediaObjectInput): Promise<StoredMediaObject>;
}

export interface LocalMediaStorageProviderOptions {
  publicRoot?: string;
  privateRoot?: string;
  publicBasePath?: string;
}

export class LocalMediaStorageProvider implements MediaStorageProvider {
  readonly name = "local";
  private readonly publicRoot: string;
  private readonly privateRoot: string;
  private readonly publicBasePath: string;

  constructor(options: LocalMediaStorageProviderOptions = {}) {
    this.publicRoot = options.publicRoot ?? path.join(process.cwd(), "public", "media");
    this.privateRoot = options.privateRoot ?? path.join(process.cwd(), ".media", "private");
    this.publicBasePath = trimSlashes(options.publicBasePath ?? "/media");
  }

  async putObject(input: StoreMediaObjectInput): Promise<StoredMediaObject> {
    const normalizedKey = normalizeObjectKey(input.objectKey);

    if (input.access !== "public") {
      const targetPath = safeTargetPath(this.privateRoot, normalizedKey, "private");

      await fs.mkdir(path.dirname(targetPath), { recursive: true });
      await fs.writeFile(targetPath, input.body);

      return {
        provider: this.name,
        objectKey: normalizedKey,
        stablePath: `media-private://${normalizedKey}`,
      };
    }

    const targetPath = safeTargetPath(this.publicRoot, normalizedKey, "public");

    await fs.mkdir(path.dirname(targetPath), { recursive: true });
    await fs.writeFile(targetPath, input.body);

    const stablePath = `/${this.publicBasePath}/${normalizedKey}`.replace(/\/+/g, "/");

    return {
      provider: this.name,
      objectKey: normalizedKey,
      stablePath,
      publicUrl: stablePath,
    };
  }
}

export function createConfiguredMediaStorageProvider(): MediaStorageProvider {
  const provider = process.env.MEDIA_STORAGE_PROVIDER ?? "local";

  if (provider === "local") {
    return new LocalMediaStorageProvider();
  }

  throw new Error(
    `MEDIA_STORAGE_PROVIDER=${provider} is documented but not configured in this build. Use local for development or add production credentials before enabling it.`,
  );
}

function normalizeObjectKey(value: string) {
  return value
    .split("/")
    .map((segment) => sanitizePathSegment(segment))
    .filter(Boolean)
    .join("/");
}

function sanitizePathSegment(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[^\w.-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
}

function trimSlashes(value: string) {
  return value.replace(/^\/+|\/+$/g, "");
}

function safeTargetPath(
  root: string,
  objectKey: string,
  label: "public" | "private",
) {
  const targetPath = path.join(root, objectKey);
  const rootWithSeparator = root.endsWith(path.sep) ? root : `${root}${path.sep}`;

  if (!targetPath.startsWith(rootWithSeparator)) {
    throw new Error(`Media object key escapes the configured ${label} media root.`);
  }

  return targetPath;
}
