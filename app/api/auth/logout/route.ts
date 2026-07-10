import { NextResponse } from "next/server";

import { revokeCurrentSession } from "@/src/domains/auth/server/runtime";

export async function POST(request: Request) {
  await revokeCurrentSession();

  return NextResponse.redirect(new URL("/", request.url), 303);
}
