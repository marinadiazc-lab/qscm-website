import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import {
  buildSubscriberCsv,
  parseSubscriberCsv,
  SubscriberService,
  type SubscriberStatus,
} from "@/src/domains/subscribers";
import { DatabaseSubscriberRepository } from "@/src/domains/subscribers/database-repository";
import { getDefaultPublicationId } from "@/src/domains/subscribers/runtime";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Admin Subscribers",
  description: "Search, import, and export subscribers.",
};

type AdminSubscribersPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function AdminSubscribersPage({
  searchParams,
}: AdminSubscribersPageProps) {
  const params = (await searchParams) ?? {};
  const q = first(params.q) ?? "";
  const status = first(params.status) as SubscriberStatus | undefined;
  const importResult = first(params.imported);
  const repository = new DatabaseSubscriberRepository();
  const service = new SubscriberService(repository);
  const publicationId = await getDefaultPublicationId();
  const rows = await service.search({
    publicationId,
    query: q,
    status: status || undefined,
    limit: 100,
  });

  async function importSubscribers(formData: FormData) {
    "use server";

    const csv = String(formData.get("csv") ?? "");
    const service = new SubscriberService(new DatabaseSubscriberRepository());
    const result = await service.importRows(await getDefaultPublicationId(), parseSubscriberCsv(csv));
    const query = new URLSearchParams({
      imported: String(result.imported),
      updated: String(result.updated),
      skipped: String(result.skipped),
    });

    redirect(`/admin/subscribers?${query.toString()}`);
  }

  const csvPreview = buildSubscriberCsv(rows).split("\n").slice(0, 4).join("\n");

  return (
    <main className="page stack">
      <header className="hero">
        <p className="badge">Admin</p>
        <h1 className="page-title">Subscribers</h1>
        <p className="lede">
          RBAC placeholder: restrict this route to admin/support/editor roles
          when the admin auth shell lands.
        </p>
      </header>
      {importResult ? (
        <p className="notice" role="status">
          Import complete: {importResult} imported, {first(params.updated) ?? "0"} updated,
          {" "}
          {first(params.skipped) ?? "0"} skipped.
        </p>
      ) : null}
      <section className="wire-panel">
        <h2>Search</h2>
        <form className="form-row" method="get">
          <input
            aria-label="Search subscribers"
            defaultValue={q}
            name="q"
            placeholder="Email or name"
            type="search"
          />
          <select aria-label="Status" defaultValue={status ?? ""} name="status">
            <option value="">Any status</option>
            <option value="active">Active</option>
            <option value="unsubscribed">Unsubscribed</option>
            <option value="bounced">Bounced</option>
            <option value="complained">Complained</option>
            <option value="suppressed">Suppressed</option>
          </select>
          <button className="button" type="submit">
            Search
          </button>
        </form>
      </section>
      <section className="admin-table-wrap" aria-label="Subscriber search results">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Email</th>
              <th>Status</th>
              <th>User</th>
              <th>Sync</th>
              <th>Source</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ subscriber, syncs }) => (
              <tr key={subscriber.id}>
                <td>{subscriber.email}</td>
                <td>{subscriber.status}</td>
                <td>{subscriber.userId ?? "Not linked"}</td>
                <td>{syncs[0] ? `${syncs[0].provider}: ${syncs[0].syncStatus}` : "None"}</td>
                <td>{subscriber.source ?? ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <section className="wire-panel">
        <h2>Import CSV</h2>
        <form action={importSubscribers} className="form-grid">
          <textarea
            aria-label="Subscriber CSV"
            name="csv"
            placeholder="email,name,status,source"
            rows={6}
          />
          <button className="button" type="submit">
            Import
          </button>
        </form>
      </section>
      <section className="wire-panel">
        <h2>Export CSV</h2>
        <pre className="csv-preview">{csvPreview}</pre>
        <Link className="secondary-button" href="/admin/subscribers/export">
          Download CSV
        </Link>
      </section>
    </main>
  );
}

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}
