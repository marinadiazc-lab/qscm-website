import type { Metadata } from "next";

import {
  AdminEmptyState,
  AdminPageHeader,
  DisabledAdminButton,
  MediaTable,
} from "../_components";
import { getAdminPublication, listAdminMedia } from "@/src/domains/admin/dashboard";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Admin Media",
  description: "Inspect registered media assets.",
};

export default async function AdminMediaPage() {
  const publication = await getAdminPublication();

  if (!publication) {
    return (
      <div className="stack">
        <AdminPageHeader title="Media" description="Media tools need a seeded publication." />
        <AdminEmptyState>No publication is available.</AdminEmptyState>
      </div>
    );
  }

  const media = await listAdminMedia(publication.id);

  return (
    <div className="stack">
      <AdminPageHeader
        title="Media"
        description="Browse stored media metadata and URLs. Upload remains disabled until storage policy is wired."
        action={<DisabledAdminButton>Upload</DisabledAdminButton>}
      />
      <MediaTable media={media} />
    </div>
  );
}
