import { NextResponse } from "next/server";

import { BillingService } from "@/src/domains/billing";
import { getDefaultPublicationId } from "@/src/domains/subscribers/runtime";

export async function POST(request: Request) {
  const expectedSecret = process.env.BILLING_RECONCILIATION_SECRET;
  const providedSecret = request.headers.get("x-qscm-job-secret");

  if (!expectedSecret || providedSecret !== expectedSecret) {
    return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });
  }

  const service = new BillingService();
  const result = await service.reconcileStripeSubscriptions({
    publicationId: await getDefaultPublicationId(),
  });

  console.info("Stripe billing reconciliation completed", result);

  return NextResponse.json({ ok: true, result });
}
