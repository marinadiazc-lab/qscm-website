import "server-only";

import { db } from "@/src/db";
import { getSiteUrl } from "@/src/content/site";
import { DrizzlePodcastRepository } from "./drizzle-repository";
import type { PodcastRepository } from "./service";

let repository: PodcastRepository | undefined;

export function getPodcastRepository(): PodcastRepository {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required for private podcast feeds.");
  }

  repository ??= new DrizzlePodcastRepository(db);
  return repository;
}

export function getPodcastBaseUrl() {
  return process.env.PODCAST_BASE_URL ?? getSiteUrl();
}
