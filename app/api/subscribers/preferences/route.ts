export async function POST() {
  return new Response("Preference updates require signed-token or authenticated access.", {
    status: 403,
  });
}
