export function normalizeSearchText(input: string | null | undefined): string {
  if (!input) return '';
  return String(input)
    .toLowerCase()
    // Remove Arabic diacritics (tashkeel) and Quranic marks
    .replace(/[\u064B-\u065F\u0670\u06D6-\u06ED]/g, '')
    // Remove Arabic tatweel
    .replace(/\u0640/g, '')
    // Normalize Arabic Alef forms
    .replace(/[أإآٱ]/g, 'ا')
    // Normalize Teh Marbuta & Alef Maksura
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    // Normalize Hamza carriers
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .replace(/\s+/g, ' ')
    .trim();
}

export function matchesSearchQuery(
  query: string,
  ...fields: Array<string | null | undefined>
): boolean {
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) return true;
  const haystack = fields
    .map((f) => normalizeSearchText(f))
    .filter(Boolean)
    .join(' ');
  if (!haystack) return false;
  const tokens = normalizedQuery.split(' ').filter(Boolean);
  return tokens.every((token) => haystack.includes(token));
}
