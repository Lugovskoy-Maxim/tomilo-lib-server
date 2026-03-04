/**
 * Экранирует спецсимволы regex (. * + ? [ ] ( ) { } ^ $ | \) для безопасной
 * подстановки в $regex или new RegExp(). Защита от ReDoS и инъекции через пользовательский ввод.
 */
export function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
