import { type Logger } from "@clipboard-health/util-ts";
import { Knock } from "@knocklabs/node";

export class IdempotentKnock extends Knock {
  public override logLevel = "warn" as const; // Knock's default.
  public override maxRetries = 1; // Knock's default is 2, but we rely on background job retries.
  public override timeout = 60_000; // Knock's default.

  protected override idempotencyHeader = "Idempotency-Key";

  constructor(params: { apiKey: string; logger: Logger }) {
    const { apiKey, logger } = params;

    super({
      apiKey,
      logger: {
        ...logger,
        debug: logger.info,
      },
    });
  }
}
