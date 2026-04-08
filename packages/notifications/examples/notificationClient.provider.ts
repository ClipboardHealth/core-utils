// embedex: packages/notifications/examples/usage.md
import { NotificationClient } from "@clipboard-health/notifications";

import { CBHLogger, type Provider, toLogger, tracer } from "./setup";

export const NOTIFICATION_CLIENT_TOKEN = "NOTIFICATION_CLIENT";

export const NotificationClientProvider: Provider<NotificationClient> = {
  provide: NOTIFICATION_CLIENT_TOKEN,
  useFactory: (): NotificationClient =>
    new NotificationClient({
      apiKey: process.env["KNOCK_API_KEY"]!,
      logger: toLogger(
        new CBHLogger({
          defaultMeta: { context: "NotificationClient" },
        }),
      ),
      tracer,
    }),
};
