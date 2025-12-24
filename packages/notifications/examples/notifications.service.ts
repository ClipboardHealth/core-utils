// embedex: packages/notifications/examples/usage.md
import { NotificationClient } from "@clipboard-health/notifications";

import { CBHLogger, toLogger, tracer } from "./setup";

export class NotificationsService {
  private readonly client: NotificationClient;

  constructor() {
    this.client = new NotificationClient({
      apiKey: "YOUR_KNOCK_API_KEY",
      logger: toLogger(new CBHLogger()),
      tracer,
    });
  }

  async triggerChunked(
    params: Parameters<NotificationClient["triggerChunked"]>[0],
  ): ReturnType<NotificationClient["triggerChunked"]> {
    return await this.client.triggerChunked(params);
  }
}
