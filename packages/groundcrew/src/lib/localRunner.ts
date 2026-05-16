import type { HostCapabilities } from "./host.ts";

export function assertLocalRunnerRequirements(host: HostCapabilities): void {
  if (!host.isSafehouseSupported) {
    throw new Error(
      "Local groundcrew runs require macOS with Safehouse. On Linux/WSL, label tickets `agent-remote` to run through the configured remote runner.",
    );
  }
  if (!host.hasSafehouse) {
    throw new Error(
      "Local groundcrew runs require `safehouse` on PATH. Install Safehouse from https://agent-safehouse.dev/ and retry.",
    );
  }
}
