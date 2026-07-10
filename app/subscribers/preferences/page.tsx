import type { Metadata } from "next";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Subscriber Preferences",
  description: "Manage QSCM email preferences.",
};

export default function SubscriberPreferencesPage() {
  notFound();
}
