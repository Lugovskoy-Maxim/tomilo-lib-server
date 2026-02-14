/**
 * Общие стили и константы для email-шаблонов.
 * Inline-стили дублируются в шаблонах для совместимости с почтовыми клиентами.
 */
export const EMAIL_STYLES = {
  fontFamily:
    '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  primaryColor: '#1976d2',
  primaryHover: '#1565c0',
  textColor: '#1a1a1a',
  textMuted: '#5f6368',
  bgCard: '#f6f8fa',
  bgLinkBlock: '#f0f4f8',
  borderColor: '#e1e5e9',
  borderRadius: '8px',
  successBorder: '#2e7d32',
} as const;

export const SITE_NAME = 'Tomilo Lib';
export const COPYRIGHT = '© 2025–2026 Tomilo Lib. Все права защищены.';
