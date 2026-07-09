const tiers = [
  {
    name: "Free",
    price: "$0",
    interval: "forever",
    description: "Public posts and free subscriber updates.",
    actions: "Join free",
  },
  {
    name: "Member",
    price: "$8",
    interval: "monthly",
    description: "Paid posts, member comments, and future private podcast access.",
    actions: "Start monthly",
  },
  {
    name: "Annual Member",
    price: "$80",
    interval: "yearly",
    description: "A yearly version of member access with the same entitlement model.",
    actions: "Start annual",
  },
];

export function SubscriptionOptions() {
  return (
    <section className="subscription-grid" aria-label="Subscription options">
      {tiers.map((tier) => (
        <article className="subscription-card" key={tier.name}>
          <div>
            <p className="badge">{tier.name}</p>
            <h2>
              {tier.price}
              <span> / {tier.interval}</span>
            </h2>
            <p>{tier.description}</p>
          </div>
          <button className="button" type="button">
            {tier.actions}
          </button>
        </article>
      ))}
    </section>
  );
}

export function EmailCapture() {
  return (
    <section className="wire-panel" aria-label="Email signup">
      <h2>Start with email</h2>
      <p>
        This will become the magic-link entry point and free subscriber signup.
      </p>
      <form className="form-row">
        <input name="email" placeholder="you@example.com" type="email" />
        <button className="button" type="button">
          Continue
        </button>
      </form>
    </section>
  );
}
