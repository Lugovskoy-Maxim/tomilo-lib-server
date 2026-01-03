import { Injectable, ConflictException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as bcrypt from 'bcrypt';
import { User, UserDocument } from '../schemas/user.schema';
import { CreateUserDto } from '../users/dto/create-user.dto';
import { LoggerService } from '../common/logger/logger.service';
import { v4 as uuidv4 } from 'uuid';
import { EmailService } from '../email/email.service';

@Injectable()
export class AuthService {
  private readonly logger = new LoggerService();

  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    private jwtService: JwtService,
    private emailService: EmailService,
  ) {
    this.logger.setContext(AuthService.name);
  }

  async validateUser(email: string, password: string): Promise<any> {
    this.logger.log(`Validating user with email: ${email}`);
    const user = await this.userModel.findOne({ email });

    if (
      user &&
      user.password &&
      (await bcrypt.compare(password, user.password))
    ) {
      this.logger.log(`User ${email} validated successfully`);
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { password, ...result } = user.toObject();
      return result;
    }
    this.logger.warn(`Invalid credentials for user: ${email}`);
    return null;
  }

  login(user: any) {
    const payload = {
      email: user.email,
      userId: user._id,
      username: user.username,
      role: user.role,
    };

    return {
      access_token: this.jwtService.sign(payload, {
        expiresIn: '30d',
      }),
      user: {
        id: user._id,
        email: user.email,
        username: user.username,
        role: user.role,
      },
    };
  }

  async register(createUserDto: CreateUserDto) {
    const { email, username, password } = createUserDto;
    this.logger.log(
      `Registering new user with email: ${email}, username: ${username}`,
    );

    // Хэширование пароля, если он предоставлен
    let hashedPassword: string | undefined = undefined;
    if (password) {
      hashedPassword = await bcrypt.hash(password, 10);
    }

    try {
      const user = new this.userModel({
        ...createUserDto,
        password: hashedPassword,
      });

      await user.save();
      this.logger.log(`User ${email} registered successfully`);

      // Send registration email
      try {
        await this.emailService.sendRegistrationEmail(email, username);
        this.logger.log(`Registration email sent to ${email}`);
      } catch (error) {
        this.logger.error(
          `Failed to send registration email to ${email}`,
          error,
        );
      }

      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { password: _, ...result } = user.toObject();
      return result;
    } catch (error) {
      if (error.code === 11000) {
        // Duplicate key error
        this.logger.warn(
          `User with email ${email} or username ${username} already exists`,
        );
        throw new ConflictException(
          'User with this email or username already exists',
        );
      }
      throw error;
    }
  }

  async sendEmailVerification(email: string) {
    const user = await this.userModel.findOne({ email });
    if (!user) {
      throw new ConflictException('User not found');
    }

    // Generate verification token
    const token = uuidv4();
    user.emailVerificationToken = token;
    await user.save();

    // Send verification email
    try {
      await this.emailService.sendEmailVerification(email, token);
      this.logger.log(`Verification email sent to ${email}`);
    } catch (error) {
      this.logger.error(`Failed to send verification email to ${email}`, error);
      throw error;
    }
  }

  async verifyEmail(token: string) {
    const user = await this.userModel.findOne({
      emailVerificationToken: token,
    });
    if (!user) {
      throw new ConflictException('Invalid verification token');
    }

    user.emailVerified = true;
    user.emailVerificationToken = undefined;
    await user.save();

    return { message: 'Email verified successfully' };
  }

  async sendPasswordReset(email: string) {
    const user = await this.userModel.findOne({ email });
    if (!user) {
      throw new ConflictException('User not found');
    }

    // Generate reset token
    const token = uuidv4();
    user.passwordResetToken = token;
    user.passwordResetExpires = new Date(Date.now() + 3600000); // 1 hour
    await user.save();

    // Send reset email
    try {
      await this.emailService.sendPasswordReset(email, token);
      this.logger.log(`Password reset email sent to ${email}`);
    } catch (error) {
      this.logger.error(
        `Failed to send password reset email to ${email}`,
        error,
      );
      throw error;
    }
  }

  async resetPassword(token: string, password: string) {
    const user = await this.userModel.findOne({
      passwordResetToken: token,
      passwordResetExpires: { $gt: Date.now() },
    });

    if (!user) {
      throw new ConflictException('Invalid or expired reset token');
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(password, 10);
    user.password = hashedPassword;
    user.passwordResetToken = undefined;
    user.passwordResetExpires = undefined;
    await user.save();

    return { message: 'Password reset successfully' };
  }

  async validateToken(payload: any) {
    return await this.userModel.findById(payload.userId);
  }

  async validateOAuthUser(oauthData: {
    provider: string;
    providerId: string;
    email?: string;
    username: string;
    firstName?: string;
    lastName?: string;
    birthDate?: Date;
    gender?: string;
  }) {
    const {
      provider,
      providerId,
      email,
      username,
      firstName,
      lastName,
      birthDate,
      gender,
    } = oauthData;
    this.logger.log(
      `Validating OAuth user from provider: ${provider}, providerId: ${providerId}`,
    );

    // Ищем пользователя по данным OAuth
    let user = await this.userModel.findOne({
      'oauth.provider': provider,
      'oauth.providerId': providerId,
    });

    // Если пользователь не найден, ищем по email
    if (!user && email) {
      this.logger.log(
        `User not found by provider data, searching by email: ${email}`,
      );
      user = await this.userModel.findOne({ email });
    }

    // Если пользователь найден, но у него нет данных OAuth, добавляем их
    if (user && (!user.oauth || !user.oauth.provider)) {
      this.logger.log(`User found but missing OAuth data, updating OAuth info`);
      user.oauth = { provider, providerId };

      // Обновляем дополнительные поля, если они предоставлены
      if (firstName) user.firstName = firstName;
      if (lastName) user.lastName = lastName;
      if (birthDate) user.birthDate = birthDate;
      if (gender) user.gender = gender;

      await user.save();
    }

    // Если пользователь не найден, создаем нового
    if (!user) {
      this.logger.log(`User not found, creating new OAuth user`);
      // Генерируем случайный пароль для OAuth пользователей
      const randomPassword = Math.random().toString(36).slice(-8);
      const hashedPassword = await bcrypt.hash(randomPassword, 10);

      user = new this.userModel({
        email: email || `${provider}_${providerId}@temp.com`,
        username: username,
        password: hashedPassword,
        oauth: { provider, providerId },
        firstName,
        lastName,
        birthDate,
        gender,
      });

      await user.save();
      this.logger.log(`New OAuth user created successfully`);
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { password, ...result } = user.toObject();
    return result;
  }
}
