import { ExecutionContext, Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/**
 * JWT guard, который не выбрасывает ошибку при отсутствии или невалидном токене.
 * Устанавливает req.user только при валидном токене; иначе req.user остаётся undefined.
 * Используется для эндпоинтов, доступных и без авторизации (например, публичный профиль).
 */
@Injectable()
export class OptionalJwtAuthGuard extends AuthGuard('jwt') {
  handleRequest<TUser = unknown>(
    _err: unknown,
    user: TUser,
    _info: unknown,
    _context?: ExecutionContext,
    _status?: unknown,
  ): TUser | null {
    return user ?? null;
  }
}
