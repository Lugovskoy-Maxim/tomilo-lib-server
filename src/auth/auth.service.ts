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

    if (user && (await bcrypt.compare(password, user.password))) {
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
      access_token: this.jwtService.sign(payload),
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

    // Хэширование пароля
    const hashedPassword = await bcrypt.hash(password, 10);

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
}
