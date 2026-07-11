import "server-only";

import { db, schema } from "@/src/db";
import { parseSubscriberCsv, SubscriberService } from "@/src/domains/subscribers";
import { DatabaseSubscriberRepository } from "@/src/domains/subscribers/database-repository";
import type { AuthUser } from "@/src/domains/auth";
import {
  buildSubscriberOperationAuditValues,
  type SubscriberOperation,
} from "./subscriber-audit";
import { getAdminPublication, listAdminSubscribers } from "./dashboard";
import { escapeCsvCell } from "./safety";

export async function exportAdminSubscribers(actor: AuthUser) {
  const publication = await requireAdminPublication();
  const subscribers = await listAdminSubscribers({
    publicationId: publication.id,
    limit: 500,
  });
  const csv = toCsv([
    [
      "email",
      "name",
      "status",
      "source",
      "account",
      "subscription",
      "email_sync",
      "comment_count",
      "created_at",
      "updated_at",
    ],
    ...subscribers.map((subscriber) => [
      subscriber.email,
      subscriber.name,
      subscriber.status,
      subscriber.source,
      subscriber.userId ? "linked" : "email_only",
      subscriber.subscriptionSummary,
      subscriber.syncSummary,
      String(subscriber.commentCount),
      subscriber.createdAt.toISOString(),
      subscriber.updatedAt.toISOString(),
    ]),
  ]);

  await recordSubscriberOperationAudit({
    publicationId: publication.id,
    actor,
    operation: "subscriber_export",
    counts: { exported: subscribers.length },
  });

  return { csv, count: subscribers.length };
}

export async function importAdminSubscribers(input: {
  actor: AuthUser;
  csv: string;
}) {
  const publication = await requireAdminPublication();
  const service = new SubscriberService(new DatabaseSubscriberRepository());
  const result = await service.importRows(publication.id, parseSubscriberCsv(input.csv));

  await recordSubscriberOperationAudit({
    publicationId: publication.id,
    actor: input.actor,
    operation: "subscriber_import",
    counts: {
      imported: result.imported,
      updated: result.updated,
      skipped: result.skipped,
      failed: result.errors.length,
    },
    failures: result.errors.map((error) => ({
      row: error.row,
      code: error.code,
      message: error.message,
    })),
  });

  return result;
}

export async function recordSubscriberOperationAudit(input: {
  publicationId: string;
  actor: AuthUser;
  operation: SubscriberOperation;
  counts: Record<string, number>;
  failures?: { row: number; code: string; message: string }[];
}) {
  await db.insert(schema.auditLogs).values(buildSubscriberOperationAuditValues(input));
}

export class AdminPublicationNotFoundError extends Error {
  constructor() {
    super("Publication not found.");
    this.name = "AdminPublicationNotFoundError";
  }
}

async function requireAdminPublication() {
  const publication = await getAdminPublication();

  if (!publication) {
    throw new AdminPublicationNotFoundError();
  }

  return publication;
}

function toCsv(rows: string[][]) {
  return rows.map((row) => row.map(escapeCsvCell).join(",")).join("\n");
}
