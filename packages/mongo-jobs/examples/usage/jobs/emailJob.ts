import type { HandlerInterface } from "@clipboard-health/mongo-jobs";

export interface EmailJobData {
  to: string;
  subject: string;
  body: string;
}

export class EmailJob implements HandlerInterface<EmailJobData> {
  public name = "EmailJob";
  public maxAttempts = 3;

  async perform({ to, subject, body }: EmailJobData) {
    // Send email logic
    console.log(`Sending email to ${to}: ${subject}`);
    await this.sendEmail(to, subject, body);
  }

  private async sendEmail(_to: string, _subject: string, _body: string) {
    // Email sending implementation
  }
}
