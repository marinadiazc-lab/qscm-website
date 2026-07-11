import { NextResponse } from "next/server";

import {
  getAdminPublication,
  listAdminSubscribers,
} from "@/src/domains/admin/dashboard";
import { escapeCsvCell } from "@/src/domains/admin/safety";
import { authorizeAdminSurface } from "@/src/domains/auth";
import { getCurrentAuthSession } from "@/src/domains/auth/server/runtime";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await getCurrentAuthSession();
  const decision = authorizeAdminSurface(auth?.user);

  if (!decision.allowed) {
    return NextResponse.json({ error: decision.message }, { status: decision.status });
  }

  const publication = await getAdminPublication();

  if (!publication) {
    return NextResponse.json({ error: "Publication not found." }, { status: 404 });
  }

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

  return new NextResponse(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": 'attachment; filename="qscm-subscribers.csv"',
    },
  });
}

function toCsv(rows: string[][]) {
  return rows.map((row) => row.map(escapeCsvCell).join(",")).join("\n");
}
