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
    expect(result.asset.stablePath).toMatch(/^\/media\/pub_1\/2026-07\/cover-image-[a-f0-9]{12}\.png$/);
    expect(result.asset.publicUrl).toBe(result.asset.stablePath);
    expect(fs.existsSync(path.join(publicRoot, result.asset.objectKey))).toBe(true);
  });

  it("rejects invalid types and image uploads without alt text", async () => {
    const service = mediaServiceForTests();

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
  });

  it("keeps admin media off public URLs while retaining metadata", async () => {
    const service = mediaServiceForTests();
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
});

function mediaServiceForTests() {
  return new MediaService(
    new InMemoryMediaRepository(),
    new LocalMediaStorageProvider({ publicRoot: makeTempDir() }),
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
