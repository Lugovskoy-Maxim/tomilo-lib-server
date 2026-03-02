import * as jwt from 'jsonwebtoken';

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
    const jwtSecret = process.env.JWT_SECRET || 'your-super-secret-jwt-key';
    const decoded = jwt.verify(token, jwtSecret) as JwtPayload;
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
    const jwtSecret = process.env.JWT_SECRET || 'your-super-secret-jwt-key';
    return jwt.verify(token, jwtSecret) as JwtPayload;
  } catch {
    return null;
  }
}
