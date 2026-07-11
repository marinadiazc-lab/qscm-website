import { NextResponse } from "next/server";

import { BillingService } from "@/src/domains/billing";

export async function POST(request: Request) {
  const rawBody = await request.text();
  const service = new BillingService();

  try {
    const result = await service.processWebhookEvent({
      provider: "stripe",
      rawBody,
      headers: Object.fromEntries(request.headers.entries()),
      receivedAt: new Date(),
    });

    return NextResponse.json({ ok: true, result });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Webhook processing failed.",
      },
      { status: 400 },
    );
  }
}
