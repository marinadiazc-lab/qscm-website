import "server-only";

import { db } from "@/src/db";
import { DrizzleMediaRepository } from "./drizzle-repository";
import { createConfiguredMediaStorageProvider } from "./provider";
import { MediaService } from "./service";

export function createMediaService() {
  return new MediaService(
    new DrizzleMediaRepository(db),
    createConfiguredMediaStorageProvider(),
  );
}
