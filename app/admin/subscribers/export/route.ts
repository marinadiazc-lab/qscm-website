import { buildSubscriberCsv, SubscriberService } from "@/src/domains/subscribers";
import { DatabaseSubscriberRepository } from "@/src/domains/subscribers/database-repository";
import { getDefaultPublicationId } from "@/src/domains/subscribers/runtime";

export async function GET() {
  const service = new SubscriberService(new DatabaseSubscriberRepository());
  const csv = buildSubscriberCsv(
    await service.search({
      publicationId: await getDefaultPublicationId(),
      limit: 1000,
    }),
  );

  return new Response(csv, {
    headers: {
      "content-disposition": 'attachment; filename="subscribers.csv"',
      "content-type": "text/csv; charset=utf-8",
    },
  });
}
