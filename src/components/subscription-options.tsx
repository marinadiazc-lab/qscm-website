import { BillingService, type CheckoutTier } from "@/src/domains/billing";
import { getDefaultPublicationId } from "@/src/domains/subscribers/runtime";

const freeTier = {
  name: "Free",
  price: "$0",
  interval: "forever",
  description: "Public posts and free subscriber updates.",
  actions: "Join free",
};

export async function SubscriptionOptions() {
  const publicationId = await getDefaultPublicationId();
  const tiers = await new BillingService().listCheckoutTiers(publicationId);

  return (
    <section className="subscription-grid" aria-label="Subscription options">
      <article className="subscription-card">
        <div>
          <p className="badge">{freeTier.name}</p>
          <h2>
            {freeTier.price}
            <span> / {freeTier.interval}</span>
          </h2>
          <p>{freeTier.description}</p>
        </div>
        <a className="button" href="#email-signup">
          {freeTier.actions}
        </a>
      </article>
      {tiers.flatMap((tier) =>
        tier.prices.map((price) => (
          <PaidTierCard
            key={price.id}
            price={price}
            publicationId={publicationId}
            tier={tier}
          />
        )),
      )}
    </section>
  );
}

function PaidTierCard({
  publicationId,
  tier,
  price,
}: {
  publicationId: string;
  tier: CheckoutTier;
  price: CheckoutTier["prices"][number];
}) {
  return (
    <article className="subscription-card">
      <div>
        <p className="badge">{tier.name}</p>
        <h2>
          {formatCurrency(price.amountCents, price.currency)}
          <span> / {price.interval === "year" ? "year" : "month"}</span>
        </h2>
        <p>{tier.description}</p>
      </div>
      <form action="/api/billing/checkout" method="post">
        <input name="publicationId" type="hidden" value={publicationId} />
        <input name="tierPriceId" type="hidden" value={price.id} />
        <button className="button" type="submit">
          {price.interval === "year" ? "Start annual" : "Start monthly"}
        </button>
      </form>
    </article>
  );
}

function formatCurrency(amountCents: number, currency: string) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency.toUpperCase(),
    maximumFractionDigits: 0,
  }).format(amountCents / 100);
}

export function EmailCapture() {
  return (
    <section className="wire-panel" id="email-signup" aria-label="Email signup">
      <h2>Start with email</h2>
      <form action="/api/subscribers/signup" className="form-row" method="post">
        <input name="source" type="hidden" value="subscribe_page" />
        <input
          aria-label="Email address"
          name="email"
          placeholder="you@example.com"
          required
          type="email"
        />
        <button className="button" type="submit">
          Join free
        </button>
      </form>
    </section>
  );
}
