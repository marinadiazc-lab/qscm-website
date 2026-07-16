import type { ComponentPropsWithoutRef } from "react";
import {
  AboutHero,
  EditorialCards,
  EditorialCta,
  EditorialFacts,
  EditorialPortrait,
  EditorialSection,
  ManifestoPlate,
  MembershipPrices,
  ProjectYear,
  PullQuote,
  SubscriptionBox,
  TestimonialGallery,
} from "@/src/components/editorial-content";

function Image(props: ComponentPropsWithoutRef<"img">) {
  const source = typeof props.src === "string" ? props.src : "";
  const imageClass = source.includes("1026x1466")
    ? "mdx-image mdx-image--portrait"
    : "mdx-image";
  const className = [imageClass, props.className].filter(Boolean).join(" ");

  // eslint-disable-next-line @next/next/no-img-element -- MDX authoring needs plain img compatibility for static and remote media.
  return <img loading="lazy" {...props} className={className} alt={props.alt ?? ""} />;
}

function Audio(props: ComponentPropsWithoutRef<"audio">) {
  return <audio controls preload="metadata" {...props} />;
}

function Video(props: ComponentPropsWithoutRef<"video">) {
  return <video controls preload="metadata" {...props} />;
}

function Anchor(props: ComponentPropsWithoutRef<"a">) {
  const href = typeof props.href === "string" ? props.href : "";

  if (isDownloadReference(href)) {
    return (
      <a {...props} className={["download-link", props.className].filter(Boolean).join(" ")} download>
        <span>{props.children}</span>
        <small>{fileLabel(href)}</small>
      </a>
    );
  }

  return <a {...props} />;
}

export const mdxComponents = {
  a: Anchor,
  img: Image,
  audio: Audio,
  video: Video,
  AboutHero,
  EditorialCards,
  EditorialCta,
  EditorialFacts,
  EditorialPortrait,
  EditorialSection,
  ManifestoPlate,
  MembershipPrices,
  ProjectYear,
  PullQuote,
  SubscriptionBox,
  TestimonialGallery,
};

function isDownloadReference(href: string) {
  const path = href.split(/[?#]/)[0];

  return /^\/media\/.+\.(csv|docx?|pdf|pptx?|txt|xlsx?|zip)$/i.test(path);
}

function fileLabel(href: string) {
  const path = href.split(/[?#]/)[0];
  const extension = path.split(".").pop();

  return extension ? extension.toUpperCase() : "Download";
}
