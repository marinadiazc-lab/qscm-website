const dangerousCsvPrefix = /^[=+\-@\t\r]/;
const sensitiveKeyPattern = /^(authorization|api[_-]?key|token|secret|password|signature|webhook[_-]?secret)$/i;

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
        sensitiveKeyPattern.test(key) ? "[redacted]" : redactSensitiveValue(nestedValue),
      ]),
    );
  }

  return value;
}

export function redactSensitiveText(value: string) {
  return value
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[redacted-email]")
    .replace(/\b(authorization)\s*[:=]\s*bearer\s+[^"',\s}]+/gi, "$1: Bearer [redacted]")
    .replace(
      /\b(api[_-]?key|token|secret|password|signature|webhook[_-]?secret)\s*[:=]\s*[^"',\s}]+/gi,
      "$1: [redacted]",
    )
    .replace(
      /"(api[_-]?key|token|secret|password|signature|webhook[_-]?secret)"\s*:\s*"[^"]*"/gi,
      '"$1":"[redacted]"',
    );
}
