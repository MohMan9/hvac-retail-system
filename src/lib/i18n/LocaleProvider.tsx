"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { getDictionary, LOCALE_COOKIE, type Dictionary, type Locale } from "./dictionaries";

const COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

type LocaleContextValue = {
  locale: Locale;
  t: (key: keyof Dictionary) => string;
  setLocale: (locale: Locale) => void;
};

const LocaleContext = createContext<LocaleContextValue | null>(null);

export function LocaleProvider({
  initialLocale,
  children,
}: {
  initialLocale: Locale;
  children: ReactNode;
}) {
  const [locale, setLocaleState] = useState<Locale>(initialLocale);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    document.cookie = `${LOCALE_COOKIE}=${next}; path=/; max-age=${COOKIE_MAX_AGE}`;
    // Flip dir/lang on the live document immediately — the root layout only
    // sets these from the cookie on the initial server render, so without
    // this the RTL/LTR switch would only take effect after a full reload.
    document.documentElement.lang = next;
    document.documentElement.dir = next === "ar" ? "rtl" : "ltr";
  }, []);

  const dict = useMemo(() => getDictionary(locale), [locale]);

  const t = useCallback((key: keyof Dictionary) => dict[key] ?? key, [dict]);

  const value = useMemo(() => ({ locale, t, setLocale }), [locale, t, setLocale]);

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale() {
  const context = useContext(LocaleContext);

  if (!context) {
    throw new Error("useLocale must be used within a LocaleProvider");
  }

  return context;
}
