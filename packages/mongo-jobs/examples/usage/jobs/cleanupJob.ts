import type { HandlerInterface } from "@clipboard-health/mongo-jobs";

export interface CleanupJobData {
  resourceType: string;
  olderThanDays: number;
}

export class CleanupJob implements HandlerInterface<CleanupJobData> {
  public name = "CleanupJob";
  public maxAttempts = 3;

  async perform({ resourceType, olderThanDays }: CleanupJobData) {
    // Cleanup logic
    console.log(`Cleaning up ${resourceType} older than ${olderThanDays} days`);
    await this.cleanupResources(resourceType, olderThanDays);
  }

  private async cleanupResources(_resourceType: string, _olderThanDays: number) {
    // Cleanup implementation
  }
}
