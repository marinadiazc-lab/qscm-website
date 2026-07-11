import type { Metadata } from "next";

import {
  AdminPageHeader,
  CommentTable,
  DisabledAdminButton,
} from "../_components";
import { getAdminPublication, listAdminComments } from "@/src/domains/admin/dashboard";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Admin Comments",
  description: "Inspect moderation queues.",
};

type CommentPageProps = {
  searchParams?: Promise<{
    status?: string;
  }>;
};

export default async function AdminCommentsPage({ searchParams }: CommentPageProps) {
  const params = (await searchParams) ?? {};
  const publication = await getAdminPublication();
  const comments = publication
    ? await listAdminComments({
        publicationId: publication.id,
        status: params.status || "suspicious",
      })
    : [];

  return (
    <div className="stack">
      <AdminPageHeader
        title="Comments"
        description="Moderation queue for suspicious, blocked, removed, and approved comment records."
        action={<DisabledAdminButton>Bulk Moderate</DisabledAdminButton>}
      />
      <form className="admin-filter-form">
        <label>
          Queue
          <select name="status" defaultValue={params.status ?? "suspicious"}>
            <option value="suspicious">Suspicious</option>
            <option value="blocked">Blocked</option>
            <option value="removed">Removed</option>
            <option value="approved">Approved</option>
          </select>
        </label>
        <button className="button" type="submit">
          Filter
        </button>
      </form>
      <CommentTable comments={comments} />
    </div>
  );
}
