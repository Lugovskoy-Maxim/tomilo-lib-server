import {
  Injectable,
  Inject,
  ConflictException,
  UnauthorizedException,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { JwtService } from '@nestjs/jwt';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import * as bcrypt from 'bcrypt';
import axios from 'axios';
import { User, UserDocument } from '../schemas/user.schema';
import { Comment, CommentDocument } from '../schemas/comment.schema';
import { Report, ReportDocument } from '../schemas/report.schema';
import {
  PendingRegistration,
  PendingRegistrationDocument,
} from '../schemas/pending-registration.schema';
import { CreateUserDto } from '../users/dto/create-user.dto';
import { LoggerService } from '../common/logger/logger.service';
import { v4 as uuidv4 } from 'uuid';
import { EmailService } from '../email/email.service';

const REGISTRATION_CODE_TTL_MS = 15 * 60 * 1000; // 15 минут
const RESEND_CODE_COOLDOWN_MS = 60 * 1000; // 1 минута

export type LinkProviderResult =
  | { linked: true }
  | { conflict: true; existingAccount: { id: string; username: string } };

export type ResolveLinkAction = 'use_existing' | 'link_here' | 'merge';

/** Ожидающая привязка после 409 (код одноразовый, второй запрос — только resolve). */
export type PendingLink = {
  provider: 'vk' | 'vk_id' | 'yandex';
  providerId: string;
};

const PENDING_LINK_CACHE_PREFIX = 'pendingLink:';
const PENDING_LINK_TTL_MS = 10 * 60 * 1000; // 10 минут

@Injectable()
export class AuthService {
  private readonly logger = new LoggerService();

  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(Comment.name) private commentModel: Model<CommentDocument>,
    @InjectModel(Report.name) private reportModel: Model<ReportDocument>,
    @InjectModel(PendingRegistration.name)
    private pendingRegistrationModel: Model<PendingRegistrationDocument>,
    private jwtService: JwtService,
    private emailService: EmailService,
    @Inject(CACHE_MANAGER)
    private cache: {
      get: (k: string) => Promise<unknown>;
      set: (k: string, v: unknown, ttl?: number) => Promise<void>;
      del: (k: string) => Promise<void>;
    },
  ) {
    this.logger.setContext(AuthService.name);
  }

  /** Сохранить ожидающую привязку в кэше (после 409). */
  async setPendingLink(
    userId: string,
    provider: PendingLink['provider'],
    providerId: string,
  ): Promise<void> {
    const key = PENDING_LINK_CACHE_PREFIX + userId;
    await this.cache.set(key, { provider, providerId }, PENDING_LINK_TTL_MS);
  }

  /** Прочитать и удалить ожидающую привязку (для запроса только с resolve). */
  async getAndClearPendingLink(userId: string): Promise<PendingLink | null> {
    const key = PENDING_LINK_CACHE_PREFIX + userId;
    const value = await this.cache.get(key);
    await this.cache.del(key);
    if (!value || typeof value !== 'object' || !('provider' in value) || !('providerId' in value)) {
      return null;
    }
    return value as PendingLink;
  }

  async validateUser(email: string, password: string): Promise<any> {
    this.logger.log(`Validating user with email: ${email}`);
    const user = await this.userModel.findOne({ email });

    if (
      user &&
      user.password &&
      (await bcrypt.compare(password, user.password))
    ) {
      // Для регистрации по email требуем подтверждение почты (emailVerified === false — ожидает код)
      if (user.emailVerified === false) {
        this.logger.warn(`Email not verified for user: ${email}`);
        return null;
      }
      this.logger.log(`User ${email} validated successfully`);
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { password, ...result } = user.toObject();
      return result;
    }
    this.logger.warn(`Invalid credentials for user: ${email}`);
    return null;
  }

  /** Access token TTL (short-lived). */
  private readonly accessTokenExpiresIn = '15m';
  /** Refresh token TTL (long-lived). */
  private readonly refreshTokenExpiresIn = '7d';

  login(user: any) {
    const payload = {
      email: user.email,
      userId: user._id,
      username: user.username,
      role: user.role,
    };

    const access_token = this.jwtService.sign(payload, {
      expiresIn: this.accessTokenExpiresIn,
    });
    const refresh_token = this.jwtService.sign(
      { ...payload, type: 'refresh' },
      { expiresIn: this.refreshTokenExpiresIn },
    );

    return {
      access_token,
      refresh_token,
      user: {
        id: user._id,
        email: user.email,
        username: user.username,
        role: user.role,
      },
    };
  }

  /**
   * Issues new access and refresh tokens using a valid refresh token.
   * Refresh token can be read from cookie or passed in body.
   */
  async refreshTokens(refreshToken: string) {
    if (!refreshToken) {
      return null;
    }
    try {
      const payload = this.jwtService.verify(refreshToken);
      if (payload.type !== 'refresh' || !payload.userId) {
        return null;
      }
      const user = await this.userModel.findById(payload.userId);
      if (!user) {
        return null;
      }
      const userObj = user.toObject();
      return this.login(userObj);
    } catch {
      return null;
    }
  }

  /** Генерирует 6-значный код подтверждения. */
  private generateVerificationCode(): string {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  /**
   * Шаг 1 регистрации: отправка кода на email. Пользователь не создаётся.
   * Лимит: раз в минуту на один email.
   */
  async requestRegistrationCode(createUserDto: CreateUserDto) {
    const { email, username, password } = createUserDto;

    const existing = await this.userModel.findOne({
      $or: [{ email }, { username }],
    });
    if (existing) {
      throw new ConflictException(
        'Этот email или имя пользователя уже заняты. Если у вас есть аккаунт — войдите.',
      );
    }

    const pending = await this.pendingRegistrationModel.findOne({ email });
    const now = Date.now();
    if (pending && pending.sentAt.getTime() > now - RESEND_CODE_COOLDOWN_MS) {
      const waitSec = Math.ceil(
        (pending.sentAt.getTime() + RESEND_CODE_COOLDOWN_MS - now) / 1000,
      );
      throw new HttpException(
        `Письмо можно отправить повторно через ${waitSec} сек`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const code = this.generateVerificationCode();
    const expiresAt = new Date(now + REGISTRATION_CODE_TTL_MS);
    const sentAt = new Date(now);
    let hashedPassword = '';
    if (password) {
      hashedPassword = await bcrypt.hash(password, 10);
    }

    await this.pendingRegistrationModel.findOneAndUpdate(
      { email },
      {
        username,
        hashedPassword,
        code,
        expiresAt,
        sentAt,
      },
      { upsert: true, new: true },
    );

    this.emailService.sendEmailVerificationCodeBackground(
      email,
      username,
      code,
      (err) =>
        this.logger.error(
          `Failed to send registration code to ${email}: ${err?.message ?? err}`,
        ),
    );
    this.logger.log(`Registration code queued for ${email}`);
    return { message: 'Код отправлен на email' };
  }

  /**
   * Шаг 2 регистрации: создание пользователя с кодом из письма.
   */
  async registerWithCode(dto: {
    email: string;
    username: string;
    password?: string;
    code: string;
  }) {
    const { email, username, password, code } = dto;

    const pending = await this.pendingRegistrationModel.findOne({ email });
    if (!pending) {
      throw new ConflictException(
        'Код не запрашивался или истёк. Запросите код снова.',
      );
    }
    if (pending.expiresAt.getTime() < Date.now()) {
      await this.pendingRegistrationModel.deleteOne({ email });
      throw new ConflictException('Код истёк. Запросите новый код.');
    }
    if (pending.code !== code) {
      throw new ConflictException('Неверный код.');
    }
    if (pending.username !== username) {
      throw new ConflictException('Имя пользователя не совпадает с запросом кода.');
    }

    const existing = await this.userModel.findOne({
      $or: [{ email }, { username }],
    });
    if (existing) {
      await this.pendingRegistrationModel.deleteOne({ email });
      throw new ConflictException(
        'Этот email или имя пользователя уже заняты. Если у вас есть аккаунт — войдите.',
      );
    }

    const hashedPassword = pending.hashedPassword || undefined;
    const user = new this.userModel({
      email,
      username,
      password: hashedPassword,
      emailVerified: true,
    });
    await user.save();
    await this.pendingRegistrationModel.deleteOne({ email });

    this.logger.log(`User ${email} registered and verified`);
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { password: _, ...result } = user.toObject();
    return result;
  }

  async sendEmailVerification(email: string) {
    const user = await this.userModel.findOne({ email });
    if (!user) {
      throw new ConflictException('User not found');
    }

    // Generate verification token
    const token = uuidv4();
    user.emailVerificationToken = token;
    user.emailVerificationExpires = new Date(Date.now() + 3600000); // 1 hour
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
    user.emailVerificationExpires = undefined;
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
    if (!password || password.trim() === '') {
      throw new ConflictException('Password is required');
    }

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

    // Ищем пользователя по любому из привязанных OAuth (массив или legacy oauth)
    let user =
      (await this.userModel.findOne({
        oauthProviders: { $elemMatch: { provider, providerId } },
      })) ??
      (await this.userModel.findOne({
        'oauth.provider': provider,
        'oauth.providerId': providerId,
      }));

    // Если не найден по провайдеру — ищем по email (привязка второго/третьего провайдера к существующему аккаунту)
    if (!user && email) {
      this.logger.log(
        `User not found by provider data, searching by email: ${email}`,
      );
      user = await this.userModel.findOne({ email });
    }

    if (user) {
      // Нормализуем oauthProviders из legacy oauth при первом обновлении
      const list = Array.isArray(user.oauthProviders) ? [...user.oauthProviders] : [];
      if (list.length === 0 && user.oauth?.provider && user.oauth?.providerId) {
        list.push({
          provider: user.oauth.provider,
          providerId: user.oauth.providerId,
        });
      }
      const alreadyLinked = list.some(
        (p) => p.provider === provider && p.providerId === providerId,
      );
      if (!alreadyLinked) {
        list.push({ provider, providerId });
        user.oauthProviders = list;
        user.oauth = user.oauth ?? { provider, providerId };
      }
      if (firstName) user.firstName = firstName;
      if (lastName) user.lastName = lastName;
      if (birthDate) user.birthDate = birthDate;
      if (gender) user.gender = gender;
      await user.save();
    } else {
      // Новый пользователь — создаём с одним провайдером
      this.logger.log(`User not found, creating new OAuth user`);
      const randomPassword = Math.random().toString(36).slice(-8);
      const hashedPassword = await bcrypt.hash(randomPassword, 10);

      user = new this.userModel({
        email: email || `${provider}_${providerId}@temp.com`,
        username: username,
        password: hashedPassword,
        oauth: { provider, providerId },
        oauthProviders: [{ provider, providerId }],
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

  /**
   * Получить providerId ВКонтакте по коду авторизации (для привязки аккаунта без учёта email).
   * redirect_uri должен совпадать с тем, что использовался при получении code.
   */
  async getVkProviderId(
    code: string,
    redirectUri?: string,
  ): Promise<string> {
    const redirect =
      redirectUri?.trim() || process.env.VK_REDIRECT_URI || '';
    try {
      const tokenResponse = await axios.get(
        `https://oauth.vk.com/access_token?` +
          `client_id=${encodeURIComponent(process.env.VK_CLIENT_ID || '')}&` +
          `client_secret=${encodeURIComponent(process.env.VK_CLIENT_SECRET || '')}&` +
          `redirect_uri=${encodeURIComponent(redirect)}&` +
          `code=${encodeURIComponent(code)}`,
      );
      const vkUserId = tokenResponse.data.user_id;
      if (!vkUserId) {
        throw new UnauthorizedException('Invalid VK authorization code');
      }
      return String(vkUserId);
    } catch (err: unknown) {
      if (err instanceof UnauthorizedException) throw err;
      const msg =
        axios.isAxiosError(err) && err.response?.data?.error_description
          ? String(err.response.data.error_description)
          : axios.isAxiosError(err) && err.response?.data?.error
            ? `VK error: ${String(err.response.data.error)}`
            : err instanceof Error
              ? err.message
              : 'VK token exchange failed';
      throw new UnauthorizedException(msg);
    }
  }

  /**
   * Получить providerId VK ID (id.vk.ru, code_v2 + PKCE) по коду и code_verifier (для привязки аккаунта).
   */
  async getVkIdProviderId(
    code: string,
    codeVerifier: string,
    deviceId: string,
    state: string,
    redirectUri?: string,
  ): Promise<string> {
    const clientId = process.env.VK_ID_CLIENT_ID;
    const redirect =
      redirectUri?.trim() || process.env.VK_ID_REDIRECT_URI || '';
    if (!clientId || !redirect) {
      throw new UnauthorizedException(
        'VK ID is not configured (VK_ID_CLIENT_ID, VK_ID_REDIRECT_URI)',
      );
    }
    const tokenParams = new URLSearchParams();
    tokenParams.append('grant_type', 'authorization_code');
    tokenParams.append('code_verifier', codeVerifier);
    tokenParams.append('redirect_uri', redirect);
    tokenParams.append('code', code);
    tokenParams.append('client_id', clientId);
    tokenParams.append('device_id', deviceId);
    tokenParams.append('state', state);
    try {
      const tokenResponse = await axios.post<{ user_id: string }>(
        'https://id.vk.ru/oauth2/auth',
        tokenParams,
        { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
      );
      const userId = tokenResponse.data?.user_id;
      if (!userId) {
        throw new UnauthorizedException('Invalid VK ID authorization code');
      }
      return String(userId);
    } catch (err: unknown) {
      if (err instanceof UnauthorizedException) throw err;
      const msg =
        axios.isAxiosError(err) && err.response?.data?.error_description
          ? String(err.response.data.error_description)
          : axios.isAxiosError(err) && err.response?.data?.error
            ? `VK ID: ${String(err.response.data.error)}`
            : err instanceof Error
              ? err.message
              : 'VK ID token exchange failed';
      throw new UnauthorizedException(msg);
    }
  }

  /**
   * Получить providerId Яндекса по code или access_token (для привязки аккаунта без учёта email).
   */
  async getYandexProviderId(
    codeOrToken: { code?: string; access_token?: string },
  ): Promise<string> {
    let accessToken = codeOrToken.access_token;
    if (codeOrToken.code && !accessToken) {
      const params = new URLSearchParams();
      params.append('grant_type', 'authorization_code');
      params.append('code', codeOrToken.code);
      params.append('client_id', process.env.YANDEX_CLIENT_ID || '');
      params.append('client_secret', process.env.YANDEX_CLIENT_SECRET || '');

      const tokenResponse = await axios.post(
        'https://oauth.yandex.ru/token',
        params,
        { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
      );
      accessToken = tokenResponse.data.access_token;
    }
    if (!accessToken) {
      throw new UnauthorizedException(
        'Yandex code or access_token is required',
      );
    }

    const userResponse = await axios.get('https://login.yandex.ru/info', {
      headers: { Authorization: `OAuth ${accessToken}` },
    });
    const id = userResponse.data?.id;
    if (!id) {
      throw new UnauthorizedException('Invalid Yandex token');
    }
    return String(id);
  }

  /** Найти пользователя, у которого привязан данный провайдер (не текущий). */
  private async findOtherUserByProvider(
    excludeUserId: string,
    provider: 'vk' | 'vk_id' | 'yandex',
    providerId: string,
  ): Promise<UserDocument | null> {
    return this.userModel.findOne({
      _id: { $ne: excludeUserId },
      $or: [
        { oauthProviders: { $elemMatch: { provider, providerId } } },
        {
          'oauth.provider': provider,
          'oauth.providerId': providerId,
        },
      ],
    });
  }

  private ensureOAuthProvidersList(user: UserDocument): { provider: string; providerId: string }[] {
    const list = Array.isArray(user.oauthProviders) ? [...user.oauthProviders] : [];
    if (list.length === 0 && user.oauth?.provider && user.oauth?.providerId) {
      list.push({
        provider: user.oauth.provider,
        providerId: user.oauth.providerId,
      });
    }
    return list;
  }

  private removeProviderFromUser(
    user: UserDocument,
    provider: 'vk' | 'vk_id' | 'yandex',
    providerId: string,
  ): void {
    const list = this.ensureOAuthProvidersList(user).filter(
      (p) => !(p.provider === provider && p.providerId === providerId),
    );
    user.oauthProviders = list;
    if (user.oauth?.provider === provider && user.oauth?.providerId === providerId) {
      user.oauth = list[0] ?? undefined;
    }
  }

  private addProviderToUser(
    user: UserDocument,
    provider: 'vk' | 'vk_id' | 'yandex',
    providerId: string,
  ): void {
    const list = this.ensureOAuthProvidersList(user);
    if (list.some((p) => p.provider === provider && p.providerId === providerId)) return;
    list.push({ provider, providerId });
    user.oauthProviders = list;
    if (!user.oauth?.provider) {
      user.oauth = { provider, providerId };
    }
  }

  /**
   * Привязать OAuth-провайдер к текущему аккаунту.
   * При конфликте (провайдер уже привязан к другому пользователю) возвращает { conflict, existingAccount } вместо ошибки.
   */
  async linkProvider(
    userId: string,
    provider: 'vk' | 'vk_id' | 'yandex',
    providerId: string,
  ): Promise<LinkProviderResult> {
    const user = await this.userModel.findById(userId);
    if (!user) {
      throw new ConflictException('User not found');
    }

    const list = this.ensureOAuthProvidersList(user);
    const alreadyLinked = list.some(
      (p) => p.provider === provider && p.providerId === providerId,
    );
    if (alreadyLinked) {
      return { linked: true };
    }

    const other = await this.findOtherUserByProvider(userId, provider, providerId);
    if (other) {
      return {
        conflict: true,
        existingAccount: {
          id: String(other._id),
          username: other.username ?? '',
        },
      };
    }

    this.addProviderToUser(user, provider, providerId);
    await user.save();
    this.logger.log(`Linked ${provider} to user ${userId}`);
    return { linked: true };
  }

  /**
   * Разрешить конфликт привязки: переключиться на другой аккаунт, привязать сюда (отвязать у другого) или объединить аккаунты.
   */
  async resolveLinkConflict(
    currentUserId: string,
    provider: 'vk' | 'vk_id' | 'yandex',
    providerId: string,
    action: ResolveLinkAction,
  ): Promise<{ linked: true; switchToUser?: any }> {
    const currentUser = await this.userModel.findById(currentUserId);
    const other = await this.findOtherUserByProvider(currentUserId, provider, providerId);
    if (!currentUser) {
      throw new ConflictException('User not found');
    }
    if (!other) {
      // конфликт уже снят — просто привязываем к текущему
      this.addProviderToUser(currentUser, provider, providerId);
      await currentUser.save();
      return { linked: true };
    }

    if (action === 'use_existing') {
      // Вернуть токены для другого аккаунта — фронт переключит пользователя
      const otherObj = other.toObject();
      const { password: _, ...safe } = otherObj;
      return { linked: true, switchToUser: this.login(safe) };
    }

    if (action === 'link_here') {
      this.removeProviderFromUser(other, provider, providerId);
      await other.save();
      this.addProviderToUser(currentUser, provider, providerId);
      await currentUser.save();
      this.logger.log(`Unlinked ${provider} from user ${other._id}, linked to ${currentUserId}`);
      return { linked: true };
    }

    // action === 'merge': склеить другой аккаунт в текущий, затем привязать провайдер (other удаляется в mergeUserInto)
    await this.mergeUserInto(other, currentUser);
    this.addProviderToUser(currentUser, provider, providerId);
    await currentUser.save();
    this.logger.log(`Merged user ${other._id} into ${currentUserId}, linked ${provider}`);
    return { linked: true };
  }

  /**
   * Перенести данные из other в target (закладки, история, избранные персонажи, опыт, монеты), переназначить комментарии, затем удалить other.
   */
  private async mergeUserInto(
    other: UserDocument,
    target: UserDocument,
  ): Promise<void> {
    const targetId = target._id;
    const otherId = other._id;

    const mergeBookmarks = (
      a: { titleId: Types.ObjectId; category: string; addedAt: Date }[],
      b: { titleId: Types.ObjectId; category: string; addedAt: Date }[],
    ) => {
      const byTitle = new Map<string, { titleId: Types.ObjectId; category: string; addedAt: Date }>();
      for (const x of a) {
        const key = x.titleId.toString();
        if (!byTitle.has(key)) byTitle.set(key, { ...x, addedAt: x.addedAt ?? new Date() });
      }
      for (const x of b) {
        const key = x.titleId.toString();
        if (!byTitle.has(key)) byTitle.set(key, { ...x, addedAt: x.addedAt ?? new Date() });
      }
      return Array.from(byTitle.values());
    };

    const aBookmarks = (target.bookmarks ?? []) as { titleId: Types.ObjectId; category: string; addedAt: Date }[];
    const bBookmarks = (other.bookmarks ?? []) as { titleId: Types.ObjectId; category: string; addedAt: Date }[];
    target.bookmarks = mergeBookmarks(aBookmarks, bBookmarks) as any;

    const aHistory = (target.readingHistory ?? []) as { titleId: Types.ObjectId; chapters: { chapterId: Types.ObjectId; chapterNumber: number; chapterTitle?: string; readAt: Date }[]; readAt: Date }[];
    const bHistory = (other.readingHistory ?? []) as { titleId: Types.ObjectId; chapters: { chapterId: Types.ObjectId; chapterNumber: number; chapterTitle?: string; readAt: Date }[]; readAt: Date }[];
    const historyByTitle = new Map<string, typeof aHistory[0]>();
    for (const h of aHistory) {
      const key = h.titleId.toString();
      historyByTitle.set(key, { ...h, readAt: h.readAt ?? new Date() });
    }
    for (const h of bHistory) {
      const key = h.titleId.toString();
      const existing = historyByTitle.get(key);
      if (!existing) {
        historyByTitle.set(key, { ...h, readAt: h.readAt ?? new Date() });
      } else {
        const chMap = new Map<string, { chapterId: Types.ObjectId; chapterNumber: number; chapterTitle?: string; readAt: Date }>();
        for (const c of existing.chapters ?? []) {
          chMap.set(c.chapterId.toString(), { ...c, readAt: c.readAt ?? new Date() });
        }
        for (const c of (h.chapters ?? []) as { chapterId: Types.ObjectId; chapterNumber: number; chapterTitle?: string; readAt: Date }[]) {
          const ckey = c.chapterId.toString();
          if (!chMap.has(ckey)) chMap.set(ckey, { ...c, readAt: c.readAt ?? new Date() });
        }
        existing.chapters = Array.from(chMap.values());
      }
    }
    target.readingHistory = Array.from(historyByTitle.values()) as any;

    const aChars = (target.favoriteCharacters ?? []) as Types.ObjectId[];
    const bChars = (other.favoriteCharacters ?? []) as Types.ObjectId[];
    const charSet = new Set([...aChars.map((c) => c.toString()), ...bChars.map((c) => c.toString())]);
    target.favoriteCharacters = Array.from(charSet).map((id) => new Types.ObjectId(id)) as any;

    target.experience = (target.experience ?? 0) + (other.experience ?? 0);
    target.balance = (target.balance ?? 0) + (other.balance ?? 0);

    await this.commentModel.updateMany(
      { userId: otherId },
      { $set: { userId: targetId } },
    );
    await this.reportModel.updateMany({ userId: otherId }, { $set: { userId: targetId } });
    await this.reportModel.updateMany({ creatorId: otherId }, { $set: { creatorId: targetId } });

    await this.userModel.deleteOne({ _id: otherId });
    this.logger.log(`Deleted merged user ${otherId}`);
  }

  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
  ) {
    const user = await this.userModel.findById(userId);
    if (!user) {
      throw new ConflictException('User not found');
    }

    // Проверяем старый пароль
    if (
      !user.password ||
      !(await bcrypt.compare(currentPassword, user.password))
    ) {
      throw new ConflictException('Invalid currentPassword');
    }

    // Хэшируем новый пароль
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    user.password = hashedPassword;
    await user.save();

    return { message: 'Password changed successfully' };
  }
}
