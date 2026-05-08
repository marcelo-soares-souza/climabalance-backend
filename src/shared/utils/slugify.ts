const MAX_SLUG_LENGTH = 200;
const MAX_SUFFIX_LENGTH = 9;

export function slugify(text: string): string {
  const maxBase = MAX_SLUG_LENGTH - MAX_SUFFIX_LENGTH;
  return text
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_]+/g, '-')
    .replace(/--+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, maxBase);
}

export function slugWithSuffix(baseSlug: string, areaId: string, length: 4 | 8 = 4): string {
  const suffix = areaId.replace(/-/g, '').slice(0, length);
  const maxBase = MAX_SLUG_LENGTH - suffix.length - 1;
  return `${baseSlug.slice(0, maxBase)}-${suffix}`;
}
