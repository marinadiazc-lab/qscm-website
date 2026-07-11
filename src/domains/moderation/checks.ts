import type {
  ModerationCheck,
  ModerationCheckInput,
  SpamDecision,
  SystemModerationDecision,
} from "./types";

export interface HoneypotTimingCheckOptions {
  minFormAgeMs?: number;
  maxFormAgeMs?: number;
  filledHoneypotOutcome?: "suspicious" | "block";
  fastSubmitOutcome?: "suspicious" | "block";
  invalidFormAgeOutcome?: "suspicious" | "block";
  staleSubmitOutcome?: "suspicious" | "block";
}

export function createHoneypotTimingCheck(
  options: HoneypotTimingCheckOptions = {},
): ModerationCheck {
  const minFormAgeMs = options.minFormAgeMs ?? 1500;
  const maxFormAgeMs = options.maxFormAgeMs ?? 24 * 60 * 60 * 1000;
  const filledHoneypotOutcome = options.filledHoneypotOutcome ?? "block";
  const fastSubmitOutcome = options.fastSubmitOutcome ?? "suspicious";
  const invalidFormAgeOutcome = options.invalidFormAgeOutcome ?? "suspicious";
  const staleSubmitOutcome = options.staleSubmitOutcome ?? "suspicious";

  return {
    name: "honeypot_timing",
    decide(input) {
      if (input.requestContext?.honeypotFilled) {
        return systemDecision(
          filledHoneypotOutcome,
          "Hidden honeypot field was filled.",
          {
            signal: "honeypot_filled",
          },
        );
      }

      const formAgeMs = input.requestContext?.formAgeMs;

      if (typeof formAgeMs !== "number") {
        return undefined;
      }

      if (!Number.isFinite(formAgeMs) || formAgeMs < 0) {
        return systemDecision(
          invalidFormAgeOutcome,
          "Form age was invalid.",
          {
            signal: "invalid_form_age",
          },
        );
      }

      if (formAgeMs < minFormAgeMs) {
        return systemDecision(
          fastSubmitOutcome,
          "Form was submitted faster than expected for a human reader.",
          {
            signal: "fast_submit",
            formAgeMs,
            minFormAgeMs,
          },
        );
      }

      if (formAgeMs > maxFormAgeMs) {
        return systemDecision(
          staleSubmitOutcome,
          "Form token age exceeded the accepted submission window.",
          {
            signal: "stale_submit",
            formAgeMs,
            maxFormAgeMs,
          },
        );
      }

      return undefined;
    },
  };
}

export interface KeywordSpamCheckOptions {
  blockedTerms?: readonly string[];
  suspiciousTerms?: readonly string[];
}

export function createKeywordSpamCheck(
  options: KeywordSpamCheckOptions = {},
): ModerationCheck {
  const blockedTerms = normalizeTerms(
    options.blockedTerms ?? ["free crypto", "casino bonus"],
  );
  const suspiciousTerms = normalizeTerms(
    options.suspiciousTerms ?? ["buy now", "work from home", "guaranteed"],
  );

  return {
    name: "keyword_spam",
    decide(input) {
      const text = `${input.body} ${input.commenterName} ${
        input.commenterWebsite ?? ""
      }`.toLowerCase();
      const blockedSignal = blockedTerms.find((term) => text.includes(term));

      if (blockedSignal) {
        return spamDecision("block", "Blocked spam keyword matched.", blockedSignal);
      }

      const suspiciousSignal = suspiciousTerms.find((term) =>
        text.includes(term),
      );

      if (suspiciousSignal) {
        return spamDecision(
          "suspicious",
          "Suspicious spam keyword matched.",
          suspiciousSignal,
        );
      }

      return undefined;
    },
  };
}

export interface ScopedRateLimitCheckOptions {
  windowMs?: number;
  maxAttempts?: number;
  action?: string;
  store?: RateLimitStore;
}

export interface RateLimitStore {
  increment(key: string, now: Date, windowMs: number): RateLimitState;
}

export interface RateLimitState {
  count: number;
  resetAt: Date;
}

export function createScopedRateLimitCheck(
  options: ScopedRateLimitCheckOptions = {},
): ModerationCheck {
  const windowMs = options.windowMs ?? 10 * 60 * 1000;
  const maxAttempts = options.maxAttempts ?? 5;
  const action = options.action ?? "comment";
  const store = options.store ?? new InMemoryRateLimitStore();

  return {
    name: "scoped_rate_limit",
    decide(input) {
      const scopes = rateLimitScopes(input);

      for (const scope of scopes) {
        const limitKey = `${action}:${scope}`;
        const state = store.increment(limitKey, input.submittedAt, windowMs);

        if (state.count > maxAttempts) {
          const retryAfterSeconds = Math.ceil(
            Math.max(0, state.resetAt.getTime() - input.submittedAt.getTime()) /
              1000,
          );

          return {
            source: "rate_limit",
            outcome: "block",
            reason: "Scoped engagement rate limit exceeded.",
            limitKey,
            limit: maxAttempts,
            remaining: 0,
            retryAfterSeconds,
            metadata: {
              windowMs,
              attempts: state.count,
              scopeCount: scopes.length,
            },
          };
        }
      }

      return undefined;
    },
  };
}

export class InMemoryRateLimitStore implements RateLimitStore {
  private readonly attempts = new Map<string, RateLimitState>();

  increment(key: string, now: Date, windowMs: number): RateLimitState {
    const existing = this.attempts.get(key);

    if (!existing || existing.resetAt.getTime() <= now.getTime()) {
      const next = {
        count: 1,
        resetAt: new Date(now.getTime() + windowMs),
      };

      this.attempts.set(key, next);
      return { ...next, resetAt: new Date(next.resetAt) };
    }

    const next = {
      count: existing.count + 1,
      resetAt: existing.resetAt,
    };

    this.attempts.set(key, next);
    return { ...next, resetAt: new Date(next.resetAt) };
  }
}

function rateLimitScopes(input: ModerationCheckInput): string[] {
  return [
    input.requestContext?.ipHash
      ? `post:${input.postSlug}:ip:${input.requestContext.ipHash}`
      : undefined,
    input.requestContext?.emailHash
      ? `post:${input.postSlug}:email:${input.requestContext.emailHash}`
      : undefined,
    input.registeredUserId
      ? `post:${input.postSlug}:user:${input.registeredUserId}`
      : undefined,
  ].filter((scope): scope is string => Boolean(scope));
}

function spamDecision(
  outcome: SpamDecision["outcome"],
  reason: string,
  signal: string,
): SpamDecision {
  return {
    source: "spam",
    outcome,
    reason,
    signals: [signal],
    metadata: {
      signal,
    },
  };
}

function systemDecision(
  outcome: SystemModerationDecision["outcome"],
  reason: string,
  metadata: SystemModerationDecision["metadata"],
): SystemModerationDecision {
  return {
    source: "system",
    outcome,
    reason,
    metadata,
  };
}

function normalizeTerms(terms: readonly string[]): string[] {
  return terms
    .map((term) => term.trim().toLowerCase())
    .filter((term) => term.length > 0);
}
