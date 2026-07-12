import { cookies } from "next/headers";
import { getDictionary, parseLocale, LOCALE_COOKIE } from "./dictionaries";

export async function getServerLocale() {
  const cookieStore = await cookies();
  return parseLocale(cookieStore.get(LOCALE_COOKIE)?.value);
}

export async function getServerDictionary() {
  const locale = await getServerLocale();
  return { locale, dict: getDictionary(locale) };
}
