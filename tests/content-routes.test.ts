import { describe, expect, it } from "vitest";
import {
  getAllPosts,
  getAllPostSlugs,
  getPostBySlug,
  getPostMetadataIndex,
} from "../src/content/posts";

describe("post content routing data", () => {
  it("exposes only published slugs for static post routes", () => {
    expect(getAllPostSlugs()).toEqual(["welcome", "paid-foundation"]);
  });

  it("loads public and private posts with the access metadata used by routes", () => {
    const publicPost = getPostBySlug("welcome");
    const paidPost = getPostBySlug("paid-foundation");

    expect(publicPost).toMatchObject({
      slug: "welcome",
      visibility: "public",
      visibilityLabel: "Public",
      accessRequirement: {
        rule: "public",
        requiresAuthentication: false,
        requiresPaidSubscription: false,
      },
    });
    expect(paidPost).toMatchObject({
      slug: "paid-foundation",
      visibility: "paid_any",
      visibilityLabel: "Paid",
      accessRequirement: {
        rule: "paid_subscription",
        requiresAuthentication: true,
        requiresPaidSubscription: true,
      },
    });
  });

  it("returns posts newest first and builds a metadata index for access checks", () => {
    expect(getAllPosts().map((post) => post.slug)).toEqual(["welcome", "paid-foundation"]);
    expect(getPostMetadataIndex()).toMatchObject({
      welcome: {
        slug: "welcome",
        visibility: "public",
        accessRequirement: { rule: "public" },
      },
      "paid-foundation": {
        slug: "paid-foundation",
        visibility: "paid_any",
        accessRequirement: { rule: "paid_subscription" },
      },
    });
  });

  it("returns undefined for unknown content paths", () => {
    expect(getPostBySlug("missing")).toBeUndefined();
  });
});
