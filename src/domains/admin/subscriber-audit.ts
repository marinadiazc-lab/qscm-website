import type { AuthUser } from "@/src/domains/auth";

export type SubscriberOperation = "subscriber_export" | "subscriber_import";

export type SubscriberOperationAuditInput = {
  publicationId: string;
  actor: AuthUser;
  operation: SubscriberOperation;
  counts: Record<string, number>;
  failures?: { row: number; code: string; message: string }[];
};

export function buildSubscriberOperationAuditValues(input: SubscriberOperationAuditInput) {
  return {
    publicationId: input.publicationId,
    actorUserId: input.actor.id,
    action: input.operation,
    subjectType: "subscribers",
    sensitivity: "restricted",
    metadata: {
      counts: input.counts,
      failureCount: input.failures?.length ?? 0,
      failures: input.failures?.slice(0, 25) ?? [],
    },
  };
}
