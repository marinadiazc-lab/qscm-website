import { NextResponse } from "next/server";

import { createSubscriberService, getDefaultPublicationId } from "@/src/domains/subscribers/runtime";

export async function POST(request: Request) {
  const contentType = request.headers.get("content-type") ?? "";
  const body = contentType.includes("application/json")
    ? await request.json()
    : Object.fromEntries((await request.formData()).entries());

  try {
    const service = await createSubscriberService();
    await service.signup({
      publicationId: String(body.publicationId || (await getDefaultPublicationId())),
      email: String(body.email ?? ""),
      name: typeof body.name === "string" ? body.name : undefined,
      source: typeof body.source === "string" ? body.source : "free_signup",
    });

    if (contentType.includes("application/json")) {
      return NextResponse.json({
        ok: true,
        message: "If this address can subscribe, the signup request has been received.",
      });
    }

    const url = new URL("/subscribe", request.url);
    url.searchParams.set("subscribed", "1");
    return NextResponse.redirect(url, { status: 303 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Signup failed.";

    if (contentType.includes("application/json")) {
      return NextResponse.json({ ok: false, error: message }, { status: 400 });
    }

    const url = new URL("/subscribe", request.url);
    url.searchParams.set("error", message);
    return NextResponse.redirect(url, { status: 303 });
  }
}
