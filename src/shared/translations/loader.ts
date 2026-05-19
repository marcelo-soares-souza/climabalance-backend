import { SUPPORTED_LOCALES } from "../utils/locale";
import { fileURLToPath } from "url";
import { dirname } from "path";
import { readFileSync, existsSync } from "fs";

type TranslationMap = Record<string, string>;

const translationsDir = dirname(fileURLToPath(import.meta.url)) + "/";

function loadSync(): Record<string, TranslationMap> {
  const translations: Record<string, TranslationMap> = {};
  for (const locale of SUPPORTED_LOCALES) {
    const path = `${translationsDir}${locale}.json`;
    try {
      translations[locale] = existsSync(path)
        ? (JSON.parse(readFileSync(path, "utf-8")) as TranslationMap)
        : {};
    } catch {
      translations[locale] = {};
    }
  }
  return translations;
}

const translations: Record<string, TranslationMap> = loadSync();

export function t(
  key: string,
  locale: string,
  params?: Record<string, string>,
): string {
  const l = (SUPPORTED_LOCALES as readonly string[]).includes(locale)
    ? locale
    : "pt-BR";
  const localeMap = translations[l] as TranslationMap | undefined;
  const fallbackMap = translations["pt-BR"] as TranslationMap | undefined;
  let msg = localeMap?.[key] ?? fallbackMap?.[key] ?? key;
  if (params) {
    msg = msg.replace(
      /\{\{(\w+)\}\}/g,
      (_match: string, k: string) => params[k] ?? `{{${k}}}`,
    );
  }
  return msg;
}
