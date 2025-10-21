import type { HandlerInterface } from "@clipboard-health/mongo-jobs";

interface EmailService {
  send(to: string, subject: string, body: string): Promise<void>;
}

export interface EmailServiceJobData {
  to: string;
  subject: string;
  body: string;
}

export class EmailServiceJob implements HandlerInterface<EmailServiceJobData> {
  public name = "EmailServiceJob";
  public maxAttempts = 3;

  constructor(private readonly emailService: EmailService) {}

  async perform({ to, subject, body }: EmailServiceJobData) {
    await this.emailService.send(to, subject, body);
  }
}
