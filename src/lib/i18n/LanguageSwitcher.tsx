"use client";

import { useRouter } from "next/navigation";
import { useLocale } from "./LocaleProvider";
import type { Locale } from "./dictionaries";

export function LanguageSwitcher() {
  const { locale, setLocale } = useLocale();
  const router = useRouter();

  function handleSwitch(next: Locale) {
    if (next === locale) {
      return;
    }

    setLocale(next);
    // Server Components (most pages) read the locale cookie on render, so a
    // client-only state update wouldn't update their text — refresh re-runs
    // them against the new cookie without a full page reload.
    router.refresh();
  }

  return (
    <div className="flex items-center gap-1 text-xs">
      <button
        type="button"
        onClick={() => handleSwitch("ar")}
        className={locale === "ar" ? "font-bold underline" : "text-gray-500"}
      >
        AR
      </button>
      <span className="text-gray-300">/</span>
      <button
        type="button"
        onClick={() => handleSwitch("en")}
        className={locale === "en" ? "font-bold underline" : "text-gray-500"}
      >
        EN
      </button>
    </div>
  );
}
