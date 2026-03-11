/**
 * Единый источник JWT секрета. В production JWT_SECRET обязателен (без дефолта в коде).
 */
export function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (process.env.NODE_ENV === 'production' && !secret) {
    throw new Error(
      'JWT_SECRET must be set in production. Add it to your environment.',
    );
  }
  return secret || 'dev-only-secret-change-in-production';
}
