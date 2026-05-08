export function slugify(text: string): string {
  return text
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_]+/g, '-')
    .replace(/--+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 200);
}

export function slugWithSuffix(baseSlug: string, areaId: string, length: 4 | 8 = 4): string {
  const suffix = areaId.replace(/-/g, '').slice(0, length);
  return `${baseSlug}-${suffix}`;
}
