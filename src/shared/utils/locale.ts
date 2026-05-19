export const SUPPORTED_LOCALES = ["pt-BR", "en", "es", "fr"] as const;

export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

export function normalizeLocale(input?: string | null): SupportedLocale {
  const raw = (input ?? "").trim().toLowerCase();
  if (raw === "pt" || raw === "pt-br") return "pt-BR";
  if (raw.startsWith("es")) return "es";
  if (raw.startsWith("fr")) return "fr";
  if (raw.startsWith("en")) return "en";
  return "pt-BR";
}

export function parseAcceptLanguage(header: string | null): SupportedLocale {
  if (!header) return "pt-BR";

  const locales = header
    .split(",")
    .map((entry) => {
      const [tag, qualityPart] = entry.split(";").map((s) => s.trim());
      const quality = qualityPart
        ? parseFloat(qualityPart.replace("q=", ""))
        : 1;
      return { tag, quality: isNaN(quality) ? 1 : quality };
    })
    .sort((a, b) => b.quality - a.quality);

  for (const { tag } of locales) {
    const normalized = normalizeLocale(tag);
    if (normalized) return normalized;
  }

  return "pt-BR";
}
