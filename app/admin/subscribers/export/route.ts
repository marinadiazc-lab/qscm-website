import { NextResponse } from "next/server";

import {
  AdminPublicationNotFoundError,
  exportAdminSubscribers,
} from "@/src/domains/admin/subscribers";
import { authorizeSubscriberAdminSurface } from "@/src/domains/auth";
import { getCurrentAuthSession } from "@/src/domains/auth/server/runtime";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await getCurrentAuthSession();
  const decision = authorizeSubscriberAdminSurface(auth?.user);

  if (!decision.allowed) {
    return NextResponse.json({ error: decision.message }, { status: decision.status });
  }

  try {
    const { csv } = await exportAdminSubscribers(decision.user);

    return new NextResponse(csv, {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": 'attachment; filename="qscm-subscribers.csv"',
      },
    });
  } catch (error) {
    if (error instanceof AdminPublicationNotFoundError) {
      return NextResponse.json({ error: "Publication not found." }, { status: 404 });
    }

    return NextResponse.json({ error: "Subscriber export failed." }, { status: 500 });
  }
}
