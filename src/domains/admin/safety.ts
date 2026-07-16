const dangerousCsvPrefix = /^[=+\-@\t\r]/;
const sensitiveKeys = new Set([
  "apikey",
  "authorization",
  "bearer",
  "clientsecret",
  "password",
  "refreshtoken",
  "secret",
  "signature",
  "signingsecret",
  "token",
  "webhooksecret",
]);

function isSensitiveKey(key: string) {
  return sensitiveKeys.has(key.replaceAll(/[_-]/g, "").toLowerCase());
}

export function escapeCsvCell(value: string) {
  const neutralized = dangerousCsvPrefix.test(value) ? `'${value}` : value;
  const escaped = neutralized.replaceAll('"', '""');

  return /[",\n\r\t]/.test(escaped) ? `"${escaped}"` : escaped;
}

export function redactSensitiveValue(value: unknown): unknown {
  if (typeof value === "string") {
    return redactSensitiveText(value);
  }

  if (Array.isArray(value)) {
    return value.map(redactSensitiveValue);
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, nestedValue]) => [
        key,
        isSensitiveKey(key) ? "[redacted]" : redactSensitiveValue(nestedValue),
      ]),
    );
  }

  return value;
}

export function redactSensitiveText(value: string) {
  return value
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[redacted-email]")
    .replace(
      /\b(authorization\s*[:=]\s*bearer\s+)("[^"]*"|'[^']*'|[^"',\s}]+)/gi,
      "$1[redacted]",
    )
    .replace(/\b(bearer\s+)("[^"]*"|'[^']*'|[A-Z0-9._~+/=-]+)/gi, "$1[redacted]")
    .replace(
      /\b(api[_-]?key|client[_-]?secret|password|refresh[_-]?token|secret|signature|signing[_-]?secret|token|webhook[_-]?secret)\s*[:=]\s*("[^"]*"|'[^']*'|[^"',\s}&}]+)/gi,
      "$1: [redacted]",
    )
    .replace(
      /"(api[_-]?key|client[_-]?secret|password|refresh[_-]?token|secret|signature|signing[_-]?secret|token|webhook[_-]?secret)"\s*:\s*"[^"]*"/gi,
      '"$1":"[redacted]"',
    );
}
