import { NextResponse } from "next/server";

import { getCurrentAuthSession } from "@/src/domains/auth/server/runtime";
import { BillingService } from "@/src/domains/billing";
import { getDefaultPublicationId } from "@/src/domains/subscribers/runtime";

export async function POST(request: Request) {
  const auth = await getCurrentAuthSession();

  if (!auth) {
    const url = new URL("/login", request.url);
    url.searchParams.set("redirectTo", "/account");
    return NextResponse.redirect(url, { status: 303 });
  }

  const formData = await request.formData().catch(() => new FormData());
  const publicationId = String(formData.get("publicationId") || (await getDefaultPublicationId()));
  const service = new BillingService();

  try {
    const session = await service.createPortalSession({
      publicationId,
      userId: auth.user.id,
      returnUrl: `${originForRequest(request)}/account`,
    });

    return NextResponse.redirect(session.url, { status: 303 });
  } catch (error) {
    const url = new URL("/account", request.url);
    url.searchParams.set(
      "billing_error",
      error instanceof Error ? error.message : "Unable to open billing portal.",
    );
    return NextResponse.redirect(url, { status: 303 });
  }
}

function originForRequest(request: Request) {
  return process.env.NEXT_PUBLIC_SITE_URL ?? new URL(request.url).origin;
}
