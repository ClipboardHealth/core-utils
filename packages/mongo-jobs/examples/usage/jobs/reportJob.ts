import type { HandlerInterface } from "@clipboard-health/mongo-jobs";

export interface ReportJobData {
  reportId: string;
  format: string;
}

export class ReportJob implements HandlerInterface<ReportJobData> {
  public name = "ReportJob";
  public maxAttempts = 5;

  async perform({ reportId, format }: ReportJobData) {
    // Generate report logic
    console.log(`Generating report ${reportId} in ${format} format`);
    await this.generateReport(reportId, format);
  }

  private async generateReport(_reportId: string, _format: string) {
    // Report generation implementation
  }
}
