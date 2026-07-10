import { NextResponse } from "next/server";

import { requestMagicLink } from "@/src/domains/auth/server/runtime";
import { getSiteUrl } from "@/src/content/site";

export async function POST(request: Request) {
  const formData = await request.formData();
  const email = String(formData.get("email") ?? "");
  const redirectTo = String(formData.get("redirectTo") ?? "/account");

  if (!email.includes("@")) {
    return NextResponse.redirect(new URL("/login?error=invalid-email", request.url), 303);
  }

  try {
    await requestMagicLink({
      email,
      redirectTo,
      baseUrl: getBaseUrl(request),
    });
  } catch (error) {
    if (error instanceof Error && error.message.includes("DATABASE_URL")) {
      return NextResponse.redirect(new URL("/login?error=database", request.url), 303);
    }

    throw error;
  }

  return NextResponse.redirect(
    new URL("/login?status=magic-link-requested", request.url),
    303,
  );
}

function getBaseUrl(request: Request): string {
  const origin = request.headers.get("origin");

  return origin ?? getSiteUrl();
}
