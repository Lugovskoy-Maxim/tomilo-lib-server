import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { UsersModule } from '../users/users.module';
import { JwtStrategy } from './strategies/jwt.strategy';
import { LocalStrategy } from './strategies/local.strategy';
import { YandexStrategy } from './strategies/yandex.strategy';
import { YandexTokenStrategy } from './strategies/yandex-token.strategy';
import { VkStrategy } from './strategies/vk.strategy';
import { VkIdStrategy } from './strategies/vk-id.strategy';
import { User, UserSchema } from '../schemas/user.schema';
import { Comment, CommentSchema } from '../schemas/comment.schema';
import { Report, ReportSchema } from '../schemas/report.schema';
import { EmailModule } from '../email/email.module';

@Module({
  imports: [
    UsersModule,
    PassportModule,
    JwtModule.register({
      secret: process.env.JWT_SECRET || 'your-super-secret-jwt-key',
      signOptions: { expiresIn: '365d' },
    }),
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: Comment.name, schema: CommentSchema },
      { name: Report.name, schema: ReportSchema },
    ]),
    EmailModule,
  ],
  providers: [
    AuthService,
    LocalStrategy,
    JwtStrategy,
    YandexStrategy,
    YandexTokenStrategy,
    VkStrategy,
    VkIdStrategy,
  ],
  controllers: [AuthController],
  exports: [AuthService],
})
export class AuthModule {}
