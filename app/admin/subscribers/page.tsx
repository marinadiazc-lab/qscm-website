import type { Metadata } from "next";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Admin Subscribers",
  description: "Search, import, and export subscribers.",
};

export default function AdminSubscribersPage() {
  notFound();
}
