import type { ComponentPropsWithoutRef } from "react";

function Image(props: ComponentPropsWithoutRef<"img">) {
  // eslint-disable-next-line @next/next/no-img-element -- MDX authoring needs plain img compatibility for static and remote media.
  return <img loading="lazy" {...props} alt={props.alt ?? ""} />;
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
