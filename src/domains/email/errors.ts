import type { EmailProviderKey } from "./types";

export class EmailProviderError extends Error {
  readonly provider?: EmailProviderKey;

  constructor(message: string, provider?: EmailProviderKey) {
    super(message);
    this.name = new.target.name;
    this.provider = provider;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class EmailProviderConfigurationError extends EmailProviderError {}

export class EmailProviderNotConfiguredError extends EmailProviderError {}
