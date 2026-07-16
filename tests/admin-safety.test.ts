import { describe, expect, it } from "vitest";

import {
  escapeCsvCell,
  redactSensitiveText,
  redactSensitiveValue,
} from "../src/domains/admin/safety";

describe("admin dashboard safety helpers", () => {
  it("neutralizes spreadsheet formulas before CSV export", () => {
    expect(escapeCsvCell("=IMPORTXML(\"https://example.com\")")).toBe(
      "\"'=IMPORTXML(\"\"https://example.com\"\")\"",
    );
    expect(escapeCsvCell("+SUM(1,2)")).toBe("\"'+SUM(1,2)\"");
    expect(escapeCsvCell("-10")).toBe("'-10");
    expect(escapeCsvCell("@reader")).toBe("'@reader");
    expect(escapeCsvCell("\t=cmd")).toBe("\"'\t=cmd\"");
    expect(escapeCsvCell("plain")).toBe("plain");
  });

  it("redacts sensitive strings and nested metadata", () => {
    expect(
      redactSensitiveText("Authorization: Bearer sk_live_secret reader@example.com"),
    ).toBe("Authorization: Bearer [redacted] [redacted-email]");
    expect(redactSensitiveText("api_key=abc123 signature=sig123")).toBe(
      "api_key: [redacted] signature: [redacted]",
    );

    expect(
      redactSensitiveValue({
        email: "reader@example.com",
        api_key: "abc123",
        nested: {
          signature: "sig123",
          note: "Contact reader@example.com",
        },
      }),
    ).toEqual({
      email: "[redacted-email]",
      api_key: "[redacted]",
      nested: {
        signature: "[redacted]",
        note: "Contact [redacted-email]",
      },
    });
  });

  it("redacts OAuth secrets, quoted values, and standalone bearer tokens", () => {
    const detail = redactSensitiveText(
      [
        "Bearer ey.secret.token",
        "client_secret=oauth-secret",
        "password='correct horse battery staple'",
      ].join(" "),
    );

    expect(detail).toBe(
      "Bearer [redacted] client_secret: [redacted] password: [redacted]",
    );
    expect(
      redactSensitiveValue({
        authorization: "Bearer nested-token",
        refreshToken: "refresh-token",
        signing_secret: "signature-secret",
      }),
    ).toEqual({
      authorization: "[redacted]",
      refreshToken: "[redacted]",
      signing_secret: "[redacted]",
    });
  });
});
