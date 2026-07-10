import { NextResponse } from "next/server";
import { getEngagementService, getRequestEngagementContext } from "@/src/domains/engagement/runtime";

type RouteContext = {
  params: Promise<{
    slug: string;
  }>;
};

export async function POST(_request: Request, context: RouteContext) {
  const { slug } = await context.params;
  const { actor, actorCookie, requestContext } = await getRequestEngagementContext();
  const service = await getEngagementService();
  const result = await service.likePost({
    postSlug: slug,
    actor,
    requestContext,
  });
  const response = NextResponse.json(result, {
    status: result.ok ? 200 : result.status === "rate_limited" ? 429 : 404,
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
