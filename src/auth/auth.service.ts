import { Injectable, ConflictException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as bcrypt from 'bcrypt';
import { User, UserDocument } from '../schemas/user.schema';
import { CreateUserDto } from '../users/dto/create-user.dto';

@Injectable()
export class AuthService {
  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    private jwtService: JwtService,
  ) {}

  async validateUser(email: string, password: string): Promise<any> {
    const user = await this.userModel.findOne({ email });

    if (
      user &&
      user.password &&
      (await bcrypt.compare(password, user.password))
    ) {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { password, ...result } = user.toObject();
      return result;
    }
    return null;
  }

  login(user: any) {
    const payload = {
      email: user.email,
      userId: user._id,
      roles: user.roles,
    };

    return {
      access_token: this.jwtService.sign(payload, {
        expiresIn: '30d',
      }),
      user: {
        id: user._id,
        email: user.email,
        username: user.username,
        roles: user.roles,
      },
    };
  }

  async register(createUserDto: CreateUserDto) {
    const { email, username, password } = createUserDto;

    // Проверка на существующего пользователя
    const existingUser = await this.userModel.findOne({
      $or: [{ email }, { username }],
    });

    if (existingUser) {
      throw new ConflictException(
        'User with this email or username already exists',
      );
    }

    // Хэширование пароля, если он предоставлен
    let hashedPassword: string | undefined = undefined;
    if (password) {
      hashedPassword = await bcrypt.hash(password, 10);
    }

    const user = new this.userModel({
      ...createUserDto,
      password: hashedPassword,
    });

    await user.save();

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { password: _, ...result } = user.toObject();
    return result;
  }

  async validateToken(payload: any) {
    return await this.userModel.findById(payload.userId);
  }

  async validateOAuthUser(oauthData: {
    provider: string;
    providerId: string;
    email?: string;
    username: string;
  }) {
    const { provider, providerId, email, username } = oauthData;

    // Ищем пользователя по данным OAuth
    let user = await this.userModel.findOne({
      'oauth.provider': provider,
      'oauth.providerId': providerId,
    });

    // Если пользователь не найден, ищем по email
    if (!user && email) {
      user = await this.userModel.findOne({ email });
    }

    // Если пользователь найден, но у него нет данных OAuth, добавляем их
    if (user && (!user.oauth || !user.oauth.provider)) {
      user.oauth = { provider, providerId };
      await user.save();
    }

    // Если пользователь не найден, создаем нового
    if (!user) {
      // Генерируем случайный пароль для OAuth пользователей
      const randomPassword = Math.random().toString(36).slice(-8);
      const hashedPassword = await bcrypt.hash(randomPassword, 10);

      user = new this.userModel({
        email: email || `${provider}_${providerId}@temp.com`,
        username: username,
        password: hashedPassword,
        oauth: { provider, providerId },
      });

      await user.save();
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { password, ...result } = user.toObject();
    return result;
  }
}
