import path from "node:path";

import type { MediaAssetKind, MediaDimensions } from "./types";

const allowedMimeTypes = new Set([
  "image/avif",
  "image/gif",
  "image/jpeg",
  "image/png",
  "image/svg+xml",
  "image/webp",
  "audio/aac",
  "audio/m4a",
  "audio/mpeg",
  "audio/mp4",
  "audio/ogg",
  "audio/wav",
  "video/mp4",
  "video/quicktime",
  "video/webm",
  "application/pdf",
  "application/zip",
  "text/csv",
  "text/plain",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
]);

const extensionMimeTypes = new Map<string, string>([
  [".aac", "audio/aac"],
  [".avif", "image/avif"],
  [".csv", "text/csv"],
  [".docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
  [".gif", "image/gif"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".m4a", "audio/mp4"],
  [".mov", "video/quicktime"],
  [".mp3", "audio/mpeg"],
  [".mp4", "video/mp4"],
  [".ogg", "audio/ogg"],
  [".pdf", "application/pdf"],
  [".png", "image/png"],
  [".pptx", "application/vnd.openxmlformats-officedocument.presentationml.presentation"],
  [".svg", "image/svg+xml"],
  [".txt", "text/plain"],
  [".wav", "audio/wav"],
  [".webm", "video/webm"],
  [".webp", "image/webp"],
  [".xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
  [".zip", "application/zip"],
]);

export function resolveMimeType(fileName: string, contentType?: string) {
  const normalized = contentType?.split(";")[0]?.trim().toLowerCase();

  if (normalized && normalized !== "application/octet-stream") {
    return normalized;
  }

  return extensionMimeTypes.get(path.extname(fileName).toLowerCase()) ?? "application/octet-stream";
}

export function assertAllowedMimeType(mimeType: string) {
  if (!allowedMimeTypes.has(mimeType)) {
    throw new Error(`Unsupported media type: ${mimeType}`);
  }
}

export function mediaKindForMimeType(mimeType: string): MediaAssetKind {
  if (mimeType.startsWith("image/")) {
    return "image";
  }

  if (mimeType.startsWith("audio/")) {
    return "audio";
  }

  if (mimeType.startsWith("video/")) {
    return "video";
  }

  if (
    mimeType === "application/pdf" ||
    mimeType === "application/zip" ||
    mimeType.startsWith("text/") ||
    mimeType.includes("officedocument")
  ) {
    return "document";
  }

  return "other";
}

export function readImageDimensions(body: Buffer, mimeType: string): MediaDimensions | undefined {
  if (mimeType === "image/png") {
    return readPngDimensions(body);
  }

  if (mimeType === "image/jpeg") {
    return readJpegDimensions(body);
  }

  if (mimeType === "image/gif") {
    return readLittleEndianDimensions(body, 6);
  }

  if (mimeType === "image/webp") {
    return readWebpDimensions(body);
  }

  if (mimeType === "image/svg+xml") {
    return readSvgDimensions(body.toString("utf8"));
  }

  return undefined;
}

function readPngDimensions(body: Buffer): MediaDimensions | undefined {
  if (body.length < 24 || body.toString("ascii", 1, 4) !== "PNG") {
    return undefined;
  }

  return {
    width: body.readUInt32BE(16),
    height: body.readUInt32BE(20),
  };
}

function readJpegDimensions(body: Buffer): MediaDimensions | undefined {
  let offset = 2;

  while (offset < body.length) {
    if (body[offset] !== 0xff) {
      return undefined;
    }

    const marker = body[offset + 1];
    const length = body.readUInt16BE(offset + 2);

    if (marker >= 0xc0 && marker <= 0xc3) {
      return {
        height: body.readUInt16BE(offset + 5),
        width: body.readUInt16BE(offset + 7),
      };
    }

    offset += 2 + length;
  }

  return undefined;
}

function readLittleEndianDimensions(body: Buffer, offset: number): MediaDimensions | undefined {
  if (body.length < offset + 4) {
    return undefined;
  }

  return {
    width: body.readUInt16LE(offset),
    height: body.readUInt16LE(offset + 2),
  };
}

function readWebpDimensions(body: Buffer): MediaDimensions | undefined {
  if (body.length < 30 || body.toString("ascii", 0, 4) !== "RIFF" || body.toString("ascii", 8, 12) !== "WEBP") {
    return undefined;
  }

  const chunk = body.toString("ascii", 12, 16);

  if (chunk === "VP8X") {
    return {
      width: 1 + body.readUIntLE(24, 3),
      height: 1 + body.readUIntLE(27, 3),
    };
  }

  if (chunk === "VP8 ") {
    return {
      width: body.readUInt16LE(26) & 0x3fff,
      height: body.readUInt16LE(28) & 0x3fff,
    };
  }

  return undefined;
}

function readSvgDimensions(svg: string): MediaDimensions | undefined {
  const width = Number(svg.match(/\bwidth=["']?(\d+(?:\.\d+)?)/i)?.[1]);
  const height = Number(svg.match(/\bheight=["']?(\d+(?:\.\d+)?)/i)?.[1]);

  if (Number.isFinite(width) && Number.isFinite(height)) {
    return { width, height };
  }

  const viewBox = svg.match(/\bviewBox=["']?([\d.\s-]+)/i)?.[1]?.trim().split(/\s+/).map(Number);

  if (viewBox?.length === 4 && viewBox.every(Number.isFinite)) {
    return { width: viewBox[2], height: viewBox[3] };
  }

  return undefined;
}
