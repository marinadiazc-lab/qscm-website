import type { ComponentPropsWithoutRef } from "react";

function Image(props: ComponentPropsWithoutRef<"img">) {
  return <img loading="lazy" {...props} alt={props.alt ?? ""} />;
}

function Audio(props: ComponentPropsWithoutRef<"audio">) {
  return <audio controls preload="metadata" {...props} />;
}

function Video(props: ComponentPropsWithoutRef<"video">) {
  return <video controls preload="metadata" {...props} />;
}

export const mdxComponents = {
  img: Image,
  audio: Audio,
  video: Video,
};
