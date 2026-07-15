import type { Locale } from "@/lib/i18n/dictionaries";

// Products, warehouses, services and customers all carry bilingual names
// (name_en / name_ar). Pick the one matching the active UI locale, falling
// back to the other language when the preferred one is missing, and finally
// to an empty string. Centralizes the hand-rolled `name_en || name_ar`
// pattern that was scattered across the app and ignored the locale entirely.
export function displayName(
  nameEn: string | null | undefined,
  nameAr: string | null | undefined,
  locale: Locale
): string {
  if (locale === "ar") {
    return nameAr || nameEn || "";
  }
  return nameEn || nameAr || "";
}
