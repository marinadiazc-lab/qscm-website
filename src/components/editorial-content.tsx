import Link from "next/link";
import type { ReactNode } from "react";

type EditorialTone = "cream" | "paper" | "plum" | "pink" | "coral" | "gold" | "blue";
type EditorialPattern = "botanical" | "fans";

function classes(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

export function AboutHero({ children }: { children: ReactNode }) {
  return (
    <section className="about-hero">
      <div className="about-hero__inner">
        <div className="about-hero__pattern" aria-hidden="true" />
        <div className="about-hero__copy">{children}</div>
        <img
          alt=""
          aria-hidden="true"
          className="about-hero__monogram"
          height="182"
          src="/brand/monogram.png"
          width="203"
        />
      </div>
    </section>
  );
}

export function EditorialSection({
  children,
  eyebrow,
  pattern,
  tone = "cream",
  variant,
}: {
  children: ReactNode;
  eyebrow?: string;
  pattern?: EditorialPattern;
  tone?: EditorialTone;
  variant?:
    | "narrow"
    | "intro"
    | "project"
    | "questions"
    | "paid"
    | "free"
    | "testimonials"
    | "facts"
    | "aside";
}) {
  return (
    <section
      className={classes(
        "about-band",
        `about-band--${tone}`,
        variant && `about-band--${variant}`,
        pattern && "about-pattern",
        pattern && `about-pattern--${pattern}`,
      )}
    >
      <div className="about-band__inner">
        {eyebrow ? <p className="about-eyebrow">{eyebrow}</p> : null}
        <div className="about-band__content">{children}</div>
      </div>
    </section>
  );
}

export function EditorialPortrait({
  alt,
  children,
  image,
}: {
  alt: string;
  children: ReactNode;
  image: string;
}) {
  return (
    <section className="about-band about-band--paper about-portrait">
      <div className="about-portrait__inner">
        <figure className="about-portrait__media">
          <img alt={alt} loading="lazy" src={image} />
        </figure>
        <div className="about-portrait__copy">{children}</div>
      </div>
    </section>
  );
}

export function PullQuote({ children }: { children: ReactNode }) {
  return <blockquote className="about-pullquote">{children}</blockquote>;
}

export function ProjectYear({
  children,
  end,
  start,
}: {
  children: ReactNode;
  end: string;
  start: string;
}) {
  return (
    <div className="project-year">
      <div className="project-year__statement">{children}</div>
      <div className="project-year__rail" aria-label={`${start} - ${end}`}>
        <time>{start}</time>
        <span aria-hidden="true" />
        <time>{end}</time>
      </div>
    </div>
  );
}

export function ManifestoPlate({ children }: { children: ReactNode }) {
  return (
    <section className="manifesto-plate">
      <div className="manifesto-plate__pattern" aria-hidden="true" />
      <div className="manifesto-plate__copy">{children}</div>
    </section>
  );
}

export function EditorialCards({ children }: { children: ReactNode }) {
  return <div className="about-card-list">{children}</div>;
}

export function MembershipPrices({
  annual,
  annualLabel,
  monthly,
  monthlyLabel,
}: {
  annual: string;
  annualLabel: string;
  monthly: string;
  monthlyLabel: string;
}) {
  return (
    <div className="about-prices">
      <article>
        <span>{monthlyLabel}</span>
        <strong>{monthly}</strong>
      </article>
      <article>
        <span>{annualLabel}</span>
        <strong>{annual}</strong>
      </article>
    </div>
  );
}

export function TestimonialGallery({ children }: { children: ReactNode }) {
  return <div className="testimonial-gallery">{children}</div>;
}

export function EditorialFacts({ children }: { children: ReactNode }) {
  return <div className="about-facts">{children}</div>;
}

export function EditorialCta({ href, children }: { href: string; children: ReactNode }) {
  return (
    <p className="editorial-cta">
      <Link className="about-button" href={href}>
        {children}
      </Link>
    </p>
  );
}

export function SubscriptionBox({
  button,
  children,
  label,
  placeholder,
}: {
  button: string;
  children: ReactNode;
  label: string;
  placeholder: string;
}) {
  return (
    <section className="about-subscription">
      <div className="about-subscription__inner">
        <div className="about-subscription__pattern" aria-hidden="true" />
        <div className="about-subscription__copy">
          <img
            alt="Qué se cuenta Marina"
            height="199"
            src="/brand/logo-reversed.png"
            width="644"
          />
          {children}
        </div>
        <form action="/api/subscribers/signup" className="about-subscription__form" method="post">
          <input name="source" type="hidden" value="about_page" />
          <label htmlFor="about-subscription-email">{label}</label>
          <input
            autoComplete="email"
            id="about-subscription-email"
            name="email"
            placeholder={placeholder}
            required
            type="email"
          />
          <button type="submit">{button}</button>
        </form>
      </div>
    </section>
  );
}
