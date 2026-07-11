import fs from "node:fs";
import path from "node:path";

const mediaLikePathPattern =
  /\.(a?ac|avif|csv|docx?|gif|jpe?g|m4a|m4v|mov|mp3|mp4|oga|ogg|pdf|png|pptx?|svg|txt|wav|webm|webp|xlsx?|zip)$/i;

export interface ValidateStaticMediaReferenceOptions {
  publicDirectory?: string;
}

export function isRemoteMediaReference(src: string) {
  return src.startsWith("http://") || src.startsWith("https://");
}

export function validateStaticMediaReference(
  src: string,
  sourcePath: string,
  options: ValidateStaticMediaReferenceOptions = {},
) {
  if (isRemoteMediaReference(src)) {
    return;
  }

  if (src.startsWith("media-private://")) {
    throw new Error(`Private media reference in ${sourcePath}: ${src} cannot be rendered in public MDX.`);
  }

  if (!src.startsWith("/")) {
    throw new Error(`Invalid media reference in ${sourcePath}: ${src} must start with / or http(s).`);
  }

  const publicDirectory =
    options.publicDirectory ?? path.join(/*turbopackIgnore: true*/ process.cwd(), "public");
  const localPath = path.join(publicDirectory, src);

  if (!localPath.startsWith(publicDirectory) || !fs.existsSync(localPath)) {
    throw new Error(`Missing media reference in ${sourcePath}: ${src} was not found in public/.`);
  }
}

export function getMarkdownImageSources(body: string) {
  return Array.from(body.matchAll(/!\[[^\]]*]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)).map(
    (match) => match[1],
  );
}

export function getMdxMediaSources(body: string) {
  const requiredMediaReferences = [
    ...getQuotedMdxAttributeSources(body, "audio|video|source|track|img", "src"),
    ...getQuotedMdxAttributeSources(body, "video", "poster"),
  ];

  const optionalMediaReferences = [
    ...getQuotedMdxAttributeSources(body, "a", "href"),
    ...getQuotedMdxAttributeSources(body, "embed|iframe", "src"),
    ...getQuotedMdxAttributeSources(body, "object", "data"),
  ].filter(isLikelyMediaAssetReference);

  return [...requiredMediaReferences, ...optionalMediaReferences];
}

export function validateStaticMdxMedia(
  references: readonly (string | undefined)[],
  body: string,
  sourcePath: string,
  options: ValidateStaticMediaReferenceOptions = {},
) {
  const sources = Array.from(
    new Set(
      [
        ...references,
        ...getMarkdownImageSources(body),
        ...getMdxMediaSources(body),
      ].filter((src): src is string => Boolean(src)),
    ),
  );

  for (const src of sources) {
    validateStaticMediaReference(src, sourcePath, options);
  }
}

function isLikelyMediaAssetReference(src: string) {
  const pathWithoutQueryOrHash = src.split(/[?#]/)[0];
  return pathWithoutQueryOrHash.startsWith("/media/") || mediaLikePathPattern.test(pathWithoutQueryOrHash);
}

function getQuotedMdxAttributeSources(body: string, tagPattern: string, attribute: string) {
  const pattern = new RegExp(
    `<\\s*(?:${tagPattern})\\b[^>]*\\s${attribute}\\s*=\\s*(?:"([^"]+)"|'([^']+)'|\\{\\s*["']([^"']+)["']\\s*\\})`,
    "gi",
  );

  return Array.from(body.matchAll(pattern)).map((match) => match[1] ?? match[2] ?? match[3]);
}
