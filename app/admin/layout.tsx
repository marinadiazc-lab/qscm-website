import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { ReactNode } from "react";

import { authorizeAdminShellSurface } from "@/src/domains/auth";
import { getCurrentAuthSession } from "@/src/domains/auth/server/runtime";

export const dynamic = "force-dynamic";

const adminNavItems = [
  { href: "/admin", label: "Dashboard" },
  { href: "/admin/subscribers", label: "Subscribers" },
  { href: "/admin/tiers", label: "Tiers" },
  { href: "/admin/access", label: "Access" },
  { href: "/admin/comments", label: "Comments" },
  { href: "/admin/media", label: "Media" },
  { href: "/admin/podcast", label: "Podcast" },
  { href: "/admin/logs", label: "Logs" },
];

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const auth = await getCurrentAuthSession();
  const decision = authorizeAdminShellSurface(auth?.user);

  if (!decision.allowed) {
    if (decision.status === 401) {
      redirect("/login?redirectTo=/admin");
    }

    notFound();
  }

  return (
    <main className="admin-shell">
      <aside className="admin-sidebar" aria-label="Admin navigation">
        <div>
          <Link className="brand" href="/admin">
            QSCM Admin
          </Link>
          <p>{decision.user.email}</p>
        </div>
        <nav>
          {adminNavItems.map((item) => (
            <Link href={item.href} key={item.href}>
              {item.label}
            </Link>
          ))}
        </nav>
      </aside>
      <section className="admin-content">{children}</section>
    </main>
  );
}
