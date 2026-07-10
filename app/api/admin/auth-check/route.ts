import { NextResponse } from "next/server";

import { authorizeAdminSurface } from "@/src/domains/auth";
import { getCurrentAuthSession } from "@/src/domains/auth/server/runtime";

export async function GET() {
  const auth = await getCurrentAuthSession();
  const decision = authorizeAdminSurface(auth?.user);

  if (!decision.allowed) {
    return NextResponse.json({ error: decision.message }, { status: decision.status });
  }

  return NextResponse.json({
    ok: true,
    userId: decision.user.id,
  });
}
