import { NextResponse, type NextRequest } from "next/server";

import {
  AdminPublicationNotFoundError,
  importAdminSubscribers,
} from "@/src/domains/admin/subscribers";
import { authorizeSubscriberAdminSurface } from "@/src/domains/auth";
import { getCurrentAuthSession } from "@/src/domains/auth/server/runtime";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const auth = await getCurrentAuthSession();
  const decision = authorizeSubscriberAdminSurface(auth?.user);

  if (!decision.allowed) {
    return NextResponse.json({ error: decision.message }, { status: decision.status });
  }

  const csv = await readCsv(request);

  try {
    const result = await importAdminSubscribers({
      actor: decision.user,
      csv,
    });
    const query = new URLSearchParams({
      imported: String(result.imported),
      updated: String(result.updated),
      skipped: String(result.skipped),
      failed: String(result.errors.length),
    });

    return NextResponse.redirect(new URL(`/admin/subscribers?${query.toString()}`, request.url), {
      status: 303,
    });
  } catch (error) {
    if (error instanceof AdminPublicationNotFoundError) {
      return NextResponse.json({ error: "Publication not found." }, { status: 404 });
    }

    return NextResponse.json({ error: "Subscriber import failed." }, { status: 400 });
  }
}

async function readCsv(request: NextRequest) {
  const contentType = request.headers.get("content-type") ?? "";

  if (
    contentType.includes("application/x-www-form-urlencoded") ||
    contentType.includes("multipart/form-data")
  ) {
    const formData = await request.formData();
    return String(formData.get("csv") ?? "");
  }

  return request.text();
}
