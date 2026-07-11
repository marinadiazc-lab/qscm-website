import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  InMemoryMediaRepository,
  LocalMediaStorageProvider,
  MediaService,
  validateStaticMdxMedia,
} from "../src/domains/media";
import { mediaAssetToPodcastEnclosure } from "../src/domains/podcast";

const now = new Date("2026-07-10T12:00:00.000Z");
const pngOneByOne = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/lL1m9QAAAABJRU5ErkJggg==",
  "base64",
);

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe("media upload registration", () => {
  it("stores public assets locally with stable URLs and image metadata", async () => {
    const publicRoot = makeTempDir();
    const repository = new InMemoryMediaRepository();
    const service = new MediaService(
      repository,
      new LocalMediaStorageProvider({ publicRoot }),
      {
        idFactory: () => "asset_1",
        clock: () => now,
      },
    );

    const result = await service.registerUpload({
      publicationId: "pub_1",
      fileName: "Cover Image.png",
      contentType: "image/png",
      body: pngOneByOne,
      altText: "Editorial cover",
    });

    expect(result.asset).toMatchObject({
      id: "asset_1",
      kind: "image",
      status: "ready",
      provider: "local",
      access: "public",
      mimeType: "image/png",
      byteLength: pngOneByOne.byteLength,
      width: 1,
      height: 1,
      altText: "Editorial cover",
    });
    expect(result.asset.stablePath).toMatch(
      /^\/media\/pub_1\/2026-07\/cover-image-[a-f0-9]{12}-asset_1\.png$/,
    );
    expect(result.asset.publicUrl).toBe(result.asset.stablePath);
    expect(fs.existsSync(path.join(publicRoot, result.asset.objectKey))).toBe(true);
  });

  it("rejects invalid types and image uploads without alt text before writing files", async () => {
    const publicRoot = makeTempDir();
    const service = mediaServiceForTests({ publicRoot });

    await expect(
      service.registerUpload({
        publicationId: "pub_1",
        fileName: "script.sh",
        contentType: "text/x-shellscript",
        body: Buffer.from("echo nope"),
      }),
    ).rejects.toThrow("Unsupported media type");

    await expect(
      service.registerUpload({
        publicationId: "pub_1",
        fileName: "cover.png",
        contentType: "image/png",
        body: pngOneByOne,
      }),
    ).rejects.toThrow("Image uploads require alt text");
    expect(fs.readdirSync(publicRoot)).toEqual([]);
  });

  it("keeps admin media off public URLs while retaining metadata", async () => {
    const publicRoot = makeTempDir();
    const privateRoot = makeTempDir();
    const service = mediaServiceForTests({ publicRoot, privateRoot });
    const result = await service.registerUpload({
      publicationId: "pub_1",
      fileName: "briefing.mp3",
      contentType: "audio/mpeg",
      body: Buffer.from("fake mp3"),
      access: "admin",
      durationSeconds: 95,
    });

    expect(result.asset).toMatchObject({
      kind: "audio",
      access: "admin",
      publicUrl: undefined,
      stablePath: expect.stringMatching(/^media-private:\/\//),
      durationSeconds: 95,
    });
    expect(fs.existsSync(path.join(publicRoot, result.asset.objectKey))).toBe(false);
    expect(fs.existsSync(path.join(privateRoot, result.asset.objectKey))).toBe(true);
  });

  it("removes stored files when repository persistence rejects", async () => {
    const publicRoot = makeTempDir();
    let objectKey = "";
    const service = new MediaService(
      {
        save: async (asset) => {
          objectKey = asset.objectKey;
          throw new Error("db rejected upload");
        },
        findById: async () => undefined,
        findByStablePath: async () => undefined,
        listRetentionCandidates: async () => [],
      },
      new LocalMediaStorageProvider({ publicRoot }),
      {
        idFactory: () => "asset_1",
        clock: () => now,
      },
    );

    await expect(
      service.registerUpload({
        publicationId: "pub_1",
        fileName: "cover.png",
        contentType: "image/png",
        body: pngOneByOne,
        altText: "Editorial cover",
      }),
    ).rejects.toThrow("db rejected upload");

    expect(objectKey).toBeTruthy();
    expect(fs.existsSync(path.join(publicRoot, objectKey))).toBe(false);
  });

  it("does not remove a previous upload when a later persistence attempt rejects", async () => {
    const publicRoot = makeTempDir();
    const repository = new InMemoryMediaRepository();
    const ids = ["asset_existing", "asset_failed"];
    const service = new MediaService(
      repository,
      new LocalMediaStorageProvider({ publicRoot }),
      {
        idFactory: () => ids.shift() ?? "asset_extra",
        clock: () => now,
      },
    );
    const existing = await service.registerUpload({
      publicationId: "pub_1",
      fileName: "cover.png",
      contentType: "image/png",
      body: pngOneByOne,
      altText: "Editorial cover",
    });
    let failedObjectKey = "";
    const failingService = new MediaService(
      {
        save: async (asset) => {
          failedObjectKey = asset.objectKey;
          throw new Error("duplicate asset row");
        },
        findById: async () => undefined,
        findByStablePath: async () => undefined,
        listRetentionCandidates: async () => [],
      },
      new LocalMediaStorageProvider({ publicRoot }),
      {
        idFactory: () => ids.shift() ?? "asset_extra",
        clock: () => now,
      },
    );

    await expect(
      failingService.registerUpload({
        publicationId: "pub_1",
        fileName: "cover.png",
        contentType: "image/png",
        body: pngOneByOne,
        altText: "Editorial cover",
      }),
    ).rejects.toThrow("duplicate asset row");

    expect(fs.existsSync(path.join(publicRoot, existing.asset.objectKey))).toBe(true);
    expect(failedObjectKey).not.toBe(existing.asset.objectKey);
    expect(fs.existsSync(path.join(publicRoot, failedObjectKey))).toBe(false);
  });

  it("identifies retention candidates without deleting them", async () => {
    const repository = new InMemoryMediaRepository([
      {
        id: "asset_1",
        publicationId: "pub_1",
        kind: "document",
        status: "ready",
        provider: "local",
        objectKey: "pub_1/old.pdf",
        stablePath: "/media/pub_1/old.pdf",
        publicUrl: "/media/pub_1/old.pdf",
        access: "public",
        mimeType: "application/pdf",
        metadata: {},
        lastReferencedAt: new Date("2025-12-01T00:00:00.000Z"),
        createdAt: new Date("2025-12-01T00:00:00.000Z"),
        updatedAt: new Date("2025-12-01T00:00:00.000Z"),
      },
    ]);
    const service = new MediaService(repository, new LocalMediaStorageProvider({ publicRoot: makeTempDir() }));

    await expect(service.listRetentionCandidates(now)).resolves.toMatchObject([
      {
        asset: { id: "asset_1" },
        reason: "unreferenced_public_asset",
      },
    ]);
  });
});

describe("static media references", () => {
  it("validates local MDX references and blocks private media schemes", () => {
    const publicRoot = makeTempDir();
    fs.mkdirSync(path.join(publicRoot, "media"), { recursive: true });
    fs.writeFileSync(path.join(publicRoot, "media", "cover.png"), pngOneByOne);

    expect(() =>
      validateStaticMdxMedia([], "![Cover](/media/cover.png)", "content/posts/test.mdx", {
        publicDirectory: publicRoot,
      }),
    ).not.toThrow();

    expect(() =>
      validateStaticMdxMedia([], '<img src="media-private://secret.pdf" />', "content/posts/test.mdx", {
        publicDirectory: publicRoot,
      }),
    ).toThrow("Private media reference");
  });
});

describe("podcast media enclosures", () => {
  it("builds RSS-ready enclosure metadata from audio assets", () => {
    const enclosure = mediaAssetToPodcastEnclosure(
      {
        kind: "audio",
        stablePath: "/media/pub_1/audio.mp3",
        publicUrl: "/media/pub_1/audio.mp3",
        mimeType: "audio/mpeg",
        byteLength: 123,
        durationSeconds: 45,
        checksumSha256: "abc",
        objectKey: "pub_1/audio.mp3",
        access: "public",
      },
      { baseUrl: "https://qscm.example" },
    );

    expect(enclosure).toEqual({
      url: "https://qscm.example/media/pub_1/audio.mp3",
      mimeType: "audio/mpeg",
      byteLength: 123,
      durationSeconds: 45,
      deliveryMode: "stable_cdn_obscure_url",
      cdnObjectKey: "pub_1/audio.mp3",
      checksumSha256: "abc",
    });
  });

  it("rejects private podcast enclosures until signed delivery exists", () => {
    expect(() =>
      mediaAssetToPodcastEnclosure(
        {
          kind: "audio",
          stablePath: "media-private://pub_1/audio.mp3",
          mimeType: "audio/mpeg",
          byteLength: 123,
          durationSeconds: 45,
          checksumSha256: "abc",
          objectKey: "pub_1/audio.mp3",
          access: "admin",
        },
        { baseUrl: "https://qscm.example" },
      ),
    ).toThrow("Non-public podcast enclosures require a signed delivery URL");
  });
});

function mediaServiceForTests(options: { publicRoot?: string; privateRoot?: string } = {}) {
  return new MediaService(
    new InMemoryMediaRepository(),
    new LocalMediaStorageProvider({
      publicRoot: options.publicRoot ?? makeTempDir(),
      privateRoot: options.privateRoot ?? makeTempDir(),
    }),
    {
      idFactory: () => "asset_1",
      clock: () => now,
    },
  );
}

function makeTempDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "qscm-media-"));
  tempDirs.push(dir);
  return dir;
}
