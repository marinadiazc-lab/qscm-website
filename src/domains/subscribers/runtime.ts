import "server-only";

import { asc, eq } from "drizzle-orm";

import { db, schema } from "@/src/db";
import { DatabaseSubscriberRepository } from "./database-repository";
import { SubscriberService } from "./service";

export async function createSubscriberService() {
  return new SubscriberService(new DatabaseSubscriberRepository());
}

export async function getDefaultPublicationId() {
  if (process.env.DEFAULT_PUBLICATION_ID) {
    return process.env.DEFAULT_PUBLICATION_ID;
  }

  const [activePublication] = await db
    .select({ id: schema.publications.id })
    .from(schema.publications)
    .where(eq(schema.publications.status, "active"))
    .orderBy(asc(schema.publications.createdAt))
    .limit(1);

  if (activePublication) {
    return activePublication.id;
  }

  const [publication] = await db
    .select({ id: schema.publications.id })
    .from(schema.publications)
    .orderBy(asc(schema.publications.createdAt))
    .limit(1);

  if (!publication) {
    throw new Error("Create a publication before accepting subscribers.");
  }

  return publication.id;
}
