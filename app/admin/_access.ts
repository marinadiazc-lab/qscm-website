import { notFound, redirect } from "next/navigation";

import {
  authorizeAdminSurface,
  authorizeModerationSurface,
  authorizeSubscriberAdminSurface,
} from "@/src/domains/auth";
import { getCurrentAuthSession } from "@/src/domains/auth/server/runtime";

export async function requireAdminPageAccess() {
  const auth = await getCurrentAuthSession();
  const decision = authorizeAdminSurface(auth?.user);

  if (!decision.allowed) {
    if (decision.status === 401) {
      redirect("/login?redirectTo=/admin");
    }

    notFound();
  }

  return decision.user;
}

export async function requireModerationPageAccess() {
  const auth = await getCurrentAuthSession();
  const decision = authorizeModerationSurface(auth?.user);

  if (!decision.allowed) {
    if (decision.status === 401) {
      redirect("/login?redirectTo=/admin/comments");
    }

    notFound();
  }

  return decision.user;
}

export async function requireSubscriberAdminPageAccess() {
  const auth = await getCurrentAuthSession();
  const decision = authorizeSubscriberAdminSurface(auth?.user);

  if (!decision.allowed) {
    if (decision.status === 401) {
      redirect("/login?redirectTo=/admin/subscribers");
    }

    notFound();
  }

  return decision.user;
}
