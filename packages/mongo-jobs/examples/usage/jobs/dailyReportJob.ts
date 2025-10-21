import type { HandlerInterface } from "@clipboard-health/mongo-jobs";

export interface DailyReportJobData {
  reportType: string;
}

export class DailyReportJob implements HandlerInterface<DailyReportJobData> {
  public name = "DailyReportJob";
  public maxAttempts = 3;

  async perform({ reportType }: DailyReportJobData) {
    // Generate daily report logic
    console.log(`Generating daily ${reportType} report`);
    await this.generateDailyReport(reportType);
  }

  private async generateDailyReport(_reportType: string) {
    // Daily report generation implementation
  }
}
