export class EmailProviderNotConfiguredError extends Error {
  constructor(providerName: string, missing: string[] = []) {
    const suffix =
      missing.length > 0 ? ` Missing configuration: ${missing.join(", ")}.` : "";

    super(`${providerName} email provider is not configured.${suffix}`);
    this.name = "EmailProviderNotConfiguredError";
  }
}
