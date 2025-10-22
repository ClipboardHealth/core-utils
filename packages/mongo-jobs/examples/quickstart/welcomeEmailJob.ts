// embedex: packages/mongo-jobs/README.md
import type { HandlerInterface } from "@clipboard-health/mongo-jobs";

export interface WelcomeEmailData {
  userId: string;
  email: string;
}

export class WelcomeEmailJob implements HandlerInterface<WelcomeEmailData> {
  public name = "WelcomeEmailJob";
  public maxAttempts = 3;

  async perform({ userId, email }: WelcomeEmailData) {
    await this.sendEmail(email, `Welcome, user ${userId}!`);
  }

  private async sendEmail(_to: string, _message: string) {
    // Email sending logic
  }
}
