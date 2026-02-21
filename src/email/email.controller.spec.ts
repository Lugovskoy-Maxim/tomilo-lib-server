import { Test, TestingModule } from '@nestjs/testing';
import { EmailController } from './email.controller';
import { EmailService } from './email.service';

describe('EmailController', () => {
  let controller: EmailController;
  let emailService: EmailService;

  const mockEmailService = {
    sendRegistrationEmail: jest.fn().mockResolvedValue(undefined),
    sendEmailVerification: jest.fn().mockResolvedValue(undefined),
    sendPasswordReset: jest.fn().mockResolvedValue(undefined),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [EmailController],
      providers: [{ provide: EmailService, useValue: mockEmailService }],
    }).compile();

    controller = module.get<EmailController>(EmailController);
    emailService = module.get<EmailService>(EmailService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('sendRegistrationEmail', () => {
    it('should call service and return success message', async () => {
      const result = await controller.sendRegistrationEmail(
        'user@example.com',
        'username',
      );
      expect(result).toEqual({
        message: 'Регистрационное письмо отправлено успешно',
      });
      expect(mockEmailService.sendRegistrationEmail).toHaveBeenCalledWith(
        'user@example.com',
        'username',
      );
    });
  });

  describe('sendEmailVerification', () => {
    it('should call service and return success message', async () => {
      const result = await controller.sendEmailVerification(
        'user@example.com',
        'token123',
      );
      expect(result).toEqual({
        message: 'Письмо с подтверждением отправлено успешно',
      });
      expect(mockEmailService.sendEmailVerification).toHaveBeenCalledWith(
        'user@example.com',
        'token123',
      );
    });
  });

  describe('sendPasswordReset', () => {
    it('should call service and return success message', async () => {
      const result = await controller.sendPasswordReset(
        'user@example.com',
        'resetToken456',
      );
      expect(result).toEqual({
        message: 'Письмо для сброса пароля отправлено успешно',
      });
      expect(mockEmailService.sendPasswordReset).toHaveBeenCalledWith(
        'user@example.com',
        'resetToken456',
      );
    });
  });
});
