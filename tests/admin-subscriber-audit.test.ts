import { describe, expect, it } from "vitest";
import { buildSubscriberOperationAuditValues } from "../src/domains/admin/subscriber-audit";
import type { AuthUser } from "../src/domains/auth";

const now = new Date("2026-07-10T12:00:00.000Z");

function actor(overrides: Partial<AuthUser> = {}): AuthUser {
  return {
    id: "user_1",
    email: "support@example.com",
    roles: ["support"],
    status: "active",
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe("subscriber operation audit payloads", () => {
  it("persists actor, operation, counts, and failure summaries without subscriber PII", () => {
    const values = buildSubscriberOperationAuditValues({
      publicationId: "pub_1",
      actor: actor(),
      operation: "subscriber_import",
      counts: {
        imported: 1,
        updated: 2,
        skipped: 3,
        failed: 1,
      },
      failures: [{ row: 7, code: "invalid_row", message: "Invalid subscriber row." }],
    });

    expect(values).toMatchObject({
      publicationId: "pub_1",
      actorUserId: "user_1",
      action: "subscriber_import",
      subjectType: "subscribers",
      sensitivity: "restricted",
      metadata: {
        counts: {
          imported: 1,
          updated: 2,
          skipped: 3,
          failed: 1,
        },
        failureCount: 1,
        failures: [{ row: 7, code: "invalid_row", message: "Invalid subscriber row." }],
      },
    });
    expect(JSON.stringify(values)).not.toContain("@");
  });
});
