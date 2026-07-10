import { NextResponse } from "next/server";

import { createSubscriberService } from "@/src/domains/subscribers/runtime";

export async function POST(request: Request) {
  const formData = await request.formData();
  const subscriberId = String(formData.get("subscriberId") ?? "");
  const redirectTo = String(formData.get("redirectTo") ?? "/subscribers/preferences");

  try {
    const service = await createSubscriberService();
    await service.updatePreferences({
      subscriberId,
      marketingEmailOptIn: formData.get("marketingEmailOptIn") === "on",
      productEmailOptIn: formData.get("productEmailOptIn") === "on",
      commentNotificationOptIn: formData.get("commentNotificationOptIn") === "on",
      unsubscribe: formData.get("unsubscribe") === "on",
    });

    const url = new URL(redirectTo, request.url);
    url.searchParams.set("saved", "1");
    return NextResponse.redirect(url, { status: 303 });
  } catch (error) {
    const url = new URL(redirectTo, request.url);
    url.searchParams.set(
      "error",
      error instanceof Error ? error.message : "Preference update failed.",
    );
    return NextResponse.redirect(url, { status: 303 });
  }
}
