import type { HandlerInterface } from "@clipboard-health/mongo-jobs";

export interface SendEmailJobData {
  userId: string;
  emailType: string;
}

export class SendEmailJob implements HandlerInterface<SendEmailJobData> {
  public name = "SendEmailJob";
  public maxAttempts = 3;

  async perform({ userId, emailType }: SendEmailJobData) {
    // Send email logic
    console.log(`Sending ${emailType} email to user ${userId}`);
    await this.sendEmail(userId, emailType);
  }

  private async sendEmail(_userId: string, _emailType: string) {
    // Email sending implementation
  }
}
