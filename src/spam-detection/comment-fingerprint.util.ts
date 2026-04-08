/**
 * Нормализованный «отпечаток» текста для поиска повторов
 * (Кккруто / Ккккруто / кккруто → одно значение).
 */
export function computeCommentContentFingerprint(raw: string): string {
  const s = (raw ?? '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/\u00AD/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    // 3+ одинаковых символа подряд → два (сохраняем «нормальные» удвоения)
    .replace(/(.)\1{2,}/gu, '$1$1');

  return s.length > 500 ? s.slice(0, 500) : s;
}
