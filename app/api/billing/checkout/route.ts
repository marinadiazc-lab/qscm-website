import { NextResponse } from "next/server";

import { getCurrentAuthSession } from "@/src/domains/auth/server/runtime";
import { BillingService } from "@/src/domains/billing";
import { getDefaultPublicationId } from "@/src/domains/subscribers/runtime";

export async function POST(request: Request) {
  const auth = await getCurrentAuthSession();

  if (!auth) {
    return redirectToLogin(request);
  }

  const formData = await request.formData();
  const tierPriceId = String(formData.get("tierPriceId") ?? "");
  const publicationId = String(formData.get("publicationId") || (await getDefaultPublicationId()));
  const service = new BillingService();

  try {
    const session = await service.createCheckoutSession({
      publicationId,
      tierPriceId,
      userId: auth.user.id,
      email: auth.user.email,
      baseUrl: originForRequest(request),
    });

    return NextResponse.redirect(session.url, { status: 303 });
  } catch (error) {
    const url = new URL("/subscribe", request.url);
    url.searchParams.set(
      "error",
      error instanceof Error ? error.message : "Unable to start checkout.",
    );
    return NextResponse.redirect(url, { status: 303 });
  }
}

function redirectToLogin(request: Request) {
  const url = new URL("/login", request.url);
  url.searchParams.set("redirectTo", "/subscribe");
  return NextResponse.redirect(url, { status: 303 });
}

function originForRequest(request: Request) {
  return process.env.NEXT_PUBLIC_SITE_URL ?? new URL(request.url).origin;
}
