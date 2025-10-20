import type { HandlerInterface } from "@clipboard-health/mongo-jobs";

export interface SmsJobData {
  phoneNumber: string;
  message: string;
}

export class SmsJob implements HandlerInterface<SmsJobData> {
  public name = "SmsJob";
  public maxAttempts = 3;

  async perform({ phoneNumber, message }: SmsJobData) {
    // Send SMS logic
    console.log(`Sending SMS to ${phoneNumber}: ${message}`);
    await this.sendSms(phoneNumber, message);
  }

  private async sendSms(_phoneNumber: string, _message: string) {
    // SMS sending implementation
  }
}
