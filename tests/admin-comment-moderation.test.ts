import { describe, expect, it } from "vitest";

import {
  adminCommentModerationTransition,
  parseAdminCommentModerationAction,
} from "../src/domains/admin/comment-moderation";

describe("admin comment moderation", () => {
  it("maps moderator actions to public visibility transitions", () => {
    expect(adminCommentModerationTransition("approve")).toMatchObject({
      status: "approved",
      outcome: "allow",
      publishesComment: true,
      removesComment: false,
    });
    expect(adminCommentModerationTransition("reject")).toMatchObject({
      status: "blocked",
      outcome: "block",
      publishesComment: false,
      removesComment: true,
    });
    expect(adminCommentModerationTransition("delete")).toMatchObject({
      status: "removed",
      outcome: "block",
      publishesComment: false,
      removesComment: true,
    });
  });

  it("parses only supported moderation actions", () => {
    expect(parseAdminCommentModerationAction("approve")).toBe("approve");
    expect(parseAdminCommentModerationAction("reject")).toBe("reject");
    expect(parseAdminCommentModerationAction("delete")).toBe("delete");
    expect(parseAdminCommentModerationAction("restore")).toBeUndefined();
    expect(parseAdminCommentModerationAction(null)).toBeUndefined();
  });
});
