import en from "./en.json";
import ar from "./ar.json";

export type Locale = "ar" | "en";

export const LOCALE_COOKIE = "locale";

const dictionaries = { en, ar };

export type Dictionary = typeof en;

export function getDictionary(locale: Locale): Dictionary {
  return dictionaries[locale];
}

export function parseLocale(value: string | undefined): Locale {
  return value === "en" ? "en" : "ar";
}
