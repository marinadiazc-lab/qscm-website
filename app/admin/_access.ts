import { notFound, redirect } from "next/navigation";

import { authorizeAdminSurface } from "@/src/domains/auth";
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
