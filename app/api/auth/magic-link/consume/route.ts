import { NextResponse } from "next/server";

import { sanitizeInternalRedirect } from "@/src/domains/auth";
import { consumeMagicLinkToken } from "@/src/domains/auth/server/runtime";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const token = url.searchParams.get("token");
  const redirectTo = sanitizeInternalRedirect(url.searchParams.get("redirectTo")) ?? "/account";

  if (!token) {
    return NextResponse.redirect(new URL("/login?error=invalid-link", request.url));
  }

  try {
    const result = await consumeMagicLinkToken({ token });

    if (result.status === "authenticated") {
      return NextResponse.redirect(new URL(redirectTo, request.url));
    }

    const error =
      result.status === "expired"
        ? "expired-link"
        : result.status === "already_used"
          ? "used-link"
          : "invalid-link";

    return NextResponse.redirect(new URL(`/login?error=${error}`, request.url));
  } catch (error) {
    if (error instanceof Error && error.message.includes("DATABASE_URL")) {
      return NextResponse.redirect(new URL("/login?error=database", request.url));
    }

    throw error;
  }
}
