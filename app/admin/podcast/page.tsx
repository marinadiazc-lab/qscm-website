import type { Metadata } from "next";

import { requireAdminPageAccess } from "../_access";
import {
  AdminEmptyState,
  AdminPageHeader,
  DisabledAdminButton,
  PodcastTable,
} from "../_components";
import {
  getAdminPublication,
  listAdminPodcastShows,
} from "@/src/domains/admin/dashboard";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Admin Podcast",
  description: "Inspect podcast shows and episodes.",
};

export default async function AdminPodcastPage() {
  await requireAdminPageAccess();

  const publication = await getAdminPublication();

  if (!publication) {
    return (
      <div className="stack">
        <AdminPageHeader title="Podcast" description="Podcast tools need a seeded publication." />
        <AdminEmptyState>No publication is available.</AdminEmptyState>
      </div>
    );
  }

  const shows = await listAdminPodcastShows(publication.id);

  return (
    <div className="stack">
      <AdminPageHeader
        title="Podcast"
        description="Inspect shows, published episode counts, and private feed token coverage."
        action={<DisabledAdminButton>New Episode</DisabledAdminButton>}
      />
      <PodcastTable shows={shows} />
    </div>
  );
}
