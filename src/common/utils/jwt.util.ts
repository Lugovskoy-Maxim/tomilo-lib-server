import * as jwt from 'jsonwebtoken';
import { getJwtSecret } from '../../config/jwt.config';

export interface JwtPayload {
  userId?: string;
  [key: string]: unknown;
}

export function extractUserIdFromRequest(req: any): string | null {
  // Сначала проверяем, есть ли user из guard'а
  if (req.user?.userId) return req.user.userId;
  if (req.user?.id) return req.user.id;
  if (req.user?._id?.toString) return req.user._id.toString();

  // Если guard не использовался, декодируем токен вручную
  const authHeader = req.headers?.authorization || req.headers?.Authorization;
  if (!authHeader?.startsWith('Bearer ')) return null;

  const token = authHeader.substring(7);
  if (!token) return null;

  try {
    const decoded = jwt.verify(token, getJwtSecret()) as JwtPayload;
    return decoded?.userId || null;
  } catch {
    return null;
  }
}

export function decodeTokenFromRequest(req: any): JwtPayload | null {
  const authHeader = req.headers?.authorization || req.headers?.Authorization;
  if (!authHeader?.startsWith('Bearer ')) return null;

  const token = authHeader.substring(7);
  if (!token) return null;

  try {
    return jwt.verify(token, getJwtSecret()) as JwtPayload;
  } catch {
    return null;
  }
}
