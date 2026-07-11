import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";

import { authorizeModerationSurface } from "@/src/domains/auth";
import { getCurrentAuthSession } from "@/src/domains/auth/server/runtime";
import { moderateAdminComment } from "@/src/domains/admin/comments";
import { parseAdminCommentModerationAction } from "@/src/domains/admin/comment-moderation";

type RouteContext = {
  params: Promise<{
    commentId: string;
  }>;
};

export async function POST(request: Request, context: RouteContext) {
  const auth = await getCurrentAuthSession();
  const decision = authorizeModerationSurface(auth?.user);

  if (!decision.allowed) {
    return NextResponse.json({ error: decision.message }, { status: decision.status });
  }

  const { commentId } = await context.params;
  const formData = await request.formData();
  const publicationId = stringValue(formData.get("publicationId"));
  const action = parseAdminCommentModerationAction(formData.get("action"));
  const returnTo = safeAdminCommentsReturnTo(formData.get("returnTo"));

  if (!publicationId) {
    return NextResponse.json({ error: "publicationId is required." }, { status: 400 });
  }

  if (!action) {
    return NextResponse.json({ error: "A valid moderation action is required." }, { status: 400 });
  }

  const result = await moderateAdminComment({
    publicationId,
    commentId,
    action,
    moderatorId: decision.user.id,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  revalidatePath("/admin/comments");

  return NextResponse.redirect(new URL(returnTo, request.url), 303);
}

function stringValue(value: FormDataEntryValue | null): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function safeAdminCommentsReturnTo(value: FormDataEntryValue | null): string {
  if (typeof value !== "string") {
    return "/admin/comments";
  }

  if (value === "/admin/comments" || value.startsWith("/admin/comments?")) {
    return value;
  }

  return "/admin/comments";
}
