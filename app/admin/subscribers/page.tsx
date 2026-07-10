import type { Metadata } from "next";
import Link from "next/link";

import {
  AdminEmptyState,
  AdminPageHeader,
  DisabledAdminButton,
  SubscriberTable,
} from "../_components";
import {
  getAdminPublication,
  listAdminSubscribers,
} from "@/src/domains/admin/dashboard";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Admin Subscribers",
  description: "Search and inspect subscriber lifecycle records.",
};

type SubscriberPageProps = {
  searchParams?: Promise<{
    q?: string;
    status?: string;
  }>;
};

export default async function AdminSubscribersPage({ searchParams }: SubscriberPageProps) {
  const params = (await searchParams) ?? {};
  const publication = await getAdminPublication();

  if (!publication) {
    return (
      <div className="stack">
        <AdminPageHeader
          title="Subscribers"
          description="Subscriber management needs the seeded QSCM publication."
        />
        <AdminEmptyState>No publication is available.</AdminEmptyState>
      </div>
    );
  }

  const subscribers = await listAdminSubscribers({
    publicationId: publication.id,
    query: params.q,
    status: params.status,
  });

  return (
    <div className="stack">
      <AdminPageHeader
        title="Subscribers"
        description="Search subscriber records, account links, email sync state, subscriptions, and comment activity."
        action={
          <div className="toolbar">
            <Link className="secondary-button" href="/admin/subscribers/export">
              Export CSV
            </Link>
            <DisabledAdminButton>Import</DisabledAdminButton>
          </div>
        }
      />
      <form className="admin-filter-form">
        <label>
          Search
          <input name="q" placeholder="Email or name" defaultValue={params.q ?? ""} />
        </label>
        <label>
          Status
          <select name="status" defaultValue={params.status ?? ""}>
            <option value="">All</option>
            <option value="active">Active</option>
            <option value="unsubscribed">Unsubscribed</option>
            <option value="bounced">Bounced</option>
            <option value="complained">Complained</option>
            <option value="suppressed">Suppressed</option>
          </select>
        </label>
        <button className="button" type="submit">
          Filter
        </button>
      </form>
      <SubscriberTable subscribers={subscribers} />
    </div>
  );
}
