import { NextResponse } from "next/server";
import { getEngagementService, getRequestEngagementContext } from "@/src/domains/engagement/runtime";

type RouteContext = {
  params: Promise<{
    slug: string;
  }>;
};

export async function POST(request: Request, context: RouteContext) {
  const { slug } = await context.params;
  const body = await request.json().catch(() => ({}));
  const { actor, actorCookie, requestContext } = await getRequestEngagementContext();
  const service = await getEngagementService();
  const result = await service.submitComment({
    postSlug: slug,
    body: String(body.comment ?? body.body ?? ""),
    name: String(body.name ?? ""),
    email: String(body.email ?? ""),
    website: body.website ? String(body.website) : undefined,
    honeypot: body.company ? String(body.company) : undefined,
    actor,
    requestContext: {
      ...requestContext,
      formAgeMs: parseFormAgeMs(body.formAgeMs),
    },
  });
  const response = NextResponse.json(result, {
    status: result.ok ? 200 : result.status === "rate_limited" ? 429 : 400,
  });

  if (actorCookie) {
    response.cookies.set(actorCookie.name, actorCookie.value, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
    });
  }

  return response;
}

function parseFormAgeMs(value: unknown) {
  if (value === undefined || value === null || value === "") return undefined;

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : -1;
}
