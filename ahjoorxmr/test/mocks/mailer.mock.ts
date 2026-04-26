/** Stub for @nestjs-modules/mailer to avoid requiring the package in tests */
export class MailerService {
  sendMail = jest.fn().mockResolvedValue(undefined);
}

export const InjectMailer = () => () => {};

export class MailerModule {
  static forRoot = jest.fn().mockReturnValue({ module: MailerModule });
  static forRootAsync = jest.fn().mockReturnValue({ module: MailerModule });
}

export class HandlebarsAdapter {}
